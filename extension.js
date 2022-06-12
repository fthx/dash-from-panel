/*
    Dash from Panel - GNOME Shell 40+ extension
    Copyright Francois Thirioux
    GitHub contributors: @fthx, @rastersoft
    Some ideas picked from GNOME Shell native code
    License GPL v3
*/

const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;
const ExtensionUtils = imports.misc.extensionUtils;
const AppDisplay = imports.ui.appDisplay;
const WorkspaceManager = global.workspace_manager;

var settings;


var Dock = GObject.registerClass(
class Dock extends Dash.Dash {
    _init() {
        super._init();
        Main.layoutManager.addTopChrome(this);
        this.showAppsButton.set_toggle_mode(false);
        this.set_opacity(Math.round(settings.get_int('icons-opacity') / 100 * 255));
        this._background.set_opacity(Math.round(settings.get_int('background-opacity') / 100 * 255));
        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this.show();
        this.dock_animated = false;
        this.keep_dock_shown = false;
        if (settings.get_boolean('hide-dock-on-session-init')) this.hide();
    }

    _itemMenuStateChanged(item, opened) {
        if (opened) {
            if (this._showLabelTimeoutId > 0) {
                GLib.source_remove(this._showLabelTimeoutId);
                this._showLabelTimeoutId = 0;
            }
            item.hideLabel();

            this._last_appicon_with_menu = item;
            this.keep_dock_shown = true;
        } else {
            if (item == this._last_appicon_with_menu) {
                this._last_appicon_with_menu = null;
                this.keep_dock_shown = false
            }
        }

        this._on_dock_hover();
    }

    _on_dock_scroll(origin, event) {
        this.active_workspace = WorkspaceManager.get_active_workspace();
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.RIGHT).activate(event.get_time());
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.LEFT).activate(event.get_time());
                break;
        }
    }

    _on_dock_hover() {
        if (!this._dashContainer.get_hover() && !this.keep_dock_shown) {
            this.auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('autohide-delay'), () => {
                if (!this._dashContainer.get_hover()) {
                    this._hide_dock();
                    this.auto_hide_dock_timeout = 0;
                }
            });
        }
    }

    _hide_dock() {
        if (this.dock_animated) {
            return;
        }

        this.dock_animated = true;
        this.ease({
            duration: settings.get_int('hide-dock-duration'),
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
                this.hide();
            },
        });
    }

    _show_dock() {
        if (this.dock_animated) {
            return;
        }

        this.show();
        this.dock_animated = true;
        this.ease({
            duration: settings.get_int('show-dock-duration'),
            opacity: Math.round(settings.get_int('icons-opacity') / 100 * 255),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
    }

    _update_size() {
        this.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!this.work_area) {
            return;
        }

        this.max_dock_height = Math.round(this.work_area.height * settings.get_int('max-height-ratio') / 100);
        this.set_width(this.work_area.width);
        this.set_height(Math.min(this.get_preferred_height(this.work_area.width), this.max_dock_height));
        this.setMaxSize(this.width, this.max_dock_height);
    }

});

class Extension {
    constructor() {
    }

    _modify_native_click_behavior() {
        this.original_click_function = AppDisplay.AppIcon.prototype.activate;
        AppDisplay.AppIcon.prototype.activate = function(button) {
            let event = Clutter.get_current_event();
            let modifiers = event ? event.get_state() : 0;
            let isMiddleButton = button && button == Clutter.BUTTON_MIDDLE;
            let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) != 0;
            let openNewWindow = this.app.can_open_new_window() && this.app.state == Shell.AppState.RUNNING && (isCtrlPressed || isMiddleButton);
            if (this.app.state == Shell.AppState.STOPPED || openNewWindow) {
                this.animateLaunch();
            }
            if (openNewWindow) {
                this.app.open_new_window(-1);
                Main.overview.hide();
            } else {
                switch (this.app.get_n_windows()) {
                    case 0:
                        this.app.activate();
                        Main.overview.hide();
                    break;
                    case 1:
                        if (this.app.get_windows()[0].has_focus() && this.app.get_windows()[0].can_minimize()) {
                            this.app.get_windows()[0].minimize();
                            Main.overview.hide();
                        } else {
                            if (!this.app.get_windows()[0].has_focus()) {
                                this.app.get_windows()[0].activate(global.get_current_time());
                                Main.overview.hide();
                            }
                        }
                    break;
                    default:
                        Main.overview.show();
                }
            }
        }
    }

    _dock_refresh() {
        if (this.dock_refreshing) {
            return;
        }
        this.dock_refreshing = true;

        this.dock._update_size();
        this.dock.set_position(this.dock.work_area.x, this.dock.work_area.y);

        this.dock_refreshing = false;
    }

    _on_panel_hover() {
        if (this.dock.auto_hide_dock_timeout) {
            this.dock.auto_hide_dock_timeout = 0;
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
        }

        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            if (this.toggle_dock_hover_timeout) {
                return;
            }
            this.toggle_dock_hover_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, settings.get_int('toggle-delay'), () => {
                if (!global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                    if (Main.panel.get_hover()) {
                        this.dock._show_dock();
                    } else {
                        if (!this.dock._dashContainer.get_hover()) {
                            this.dock._hide_dock();
                        }
                    }
                }
                this.toggle_dock_hover_timeout = 0;
                return false;
            });
        }
    }

    _on_settings_changed() {
        this.dock._background.set_opacity(Math.round(settings.get_int('background-opacity') / 100 * 255));
        this.dock.set_opacity(Math.round(settings.get_int('icons-opacity') / 100 * 255));
        this._dock_refresh();
    }

    _create_dock() {
        this.dock = new Dock();
        this._dock_refresh();

        this.panel_hover = Main.panel.connect('notify::hover', this._on_panel_hover.bind(this));
        this.panel_scroll = Main.panel.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));

        this.dock._dashContainer.connect('notify::hover', this.dock._on_dock_hover.bind(this.dock));
        this.dock._dashContainer.connect('scroll-event', this.dock._on_dock_scroll.bind(this.dock));

        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());
        this.workareas_changed = global.display.connect_after('workareas-changed', this._dock_refresh.bind(this));
    }

    enable() {
        settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dash-from-panel')
        this.settings_changed = settings.connect('changed', this._on_settings_changed.bind(this));

        this._modify_native_click_behavior();
        Main.panel.set_track_hover(true);
        this._create_dock();

        Main.layoutManager.connect('startup-complete', () => {
            Main.overview.hide();
        });
    }

    disable() {
        AppDisplay.AppIcon.prototype.activate = this.original_click_function;

        if (this.settings_changed) {
            settings.disconnect(this.settings_changed);
        }

        if (this.toggle_dock_hover_timeout) {
            this.toggle_dock_hover_timeout = 0;
            GLib.source_remove(this.toggle_dock_hover_timeout);
        }
        if (this.dock.auto_hide_dock_timeout) {
            this.dock.auto_hide_dock_timeout = 0;
            GLib.source_remove(this.dock.auto_hide_dock_timeout);
        }

        if (this.workareas_changed) {
            global.display.disconnect(this.workareas_changed);
            this.workareas_changed = null;
        }

        if (this.panel_hover) {
            Main.panel.disconnect(this.panel_hover);
        }
        if (this.panel_scroll) {
            Main.panel.disconnect(this.panel_scroll);
        }

        Main.layoutManager.removeChrome(this.dock);
        this.dock.destroy();
        settings = null;
    }
}

function init() {
    return new Extension();
}
