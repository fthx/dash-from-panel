/*
    Dash from Panel - GNOME Shell 40+ extension
    Copyright Francois Thirioux 2022
    GitHub contributors: @fthx
    Some ideas picked from GNOME Shell native code
    License GPL v3
*/

const { Clutter, GLib, GObject } = imports.gi;

const Main = imports.ui.main;
const Dash = imports.ui.dash;

var DASH_MAX_HEIGHT_RATIO = 0.1;
var DASH_OPACITY_RATIO = 0.9;
var SHOW_DOCK_DURATION = 200;
var HIDE_DOCK_DURATION = 200;
var SHOW_DOCK_DELAY = 200;
var HIDE_DOCK_DELAY = 500;
var AUTO_HIDE_DOCK_DELAY = 500;


var Dock = GObject.registerClass(
class Dock extends Dash.Dash {
    _init() {
        super._init();
        Main.layoutManager.addTopChrome(this);
        this.showAppsButton.set_toggle_mode(false);
        this.set_track_hover(true);
        this.set_reactive(true);
        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this.set_opacity(Math.round(DASH_OPACITY_RATIO * 255));
        this.show();
    }
});

class Extension {
    constructor() {
        if (Main.layoutManager.startInOverview) {
            Main.layoutManager.startInOverview = false;
        }
    }

    _dock_refresh() {
        if (this.dock_refreshing) {
            return;
        }
        this.dock_refreshing = true;
        this.work_area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        if (!this.work_area) {
            return;
        }
        this.max_dock_height = Math.round(this.work_area.height * DASH_MAX_HEIGHT_RATIO);
        this.dock.set_width(this.work_area.width);
        this.dock.set_height(Math.min(this.dock.get_preferred_height(this.work_area.width), this.max_dock_height));
        this.dock.setMaxSize(this.work_area.width, this.max_dock_height);
        this.dock.set_position(this.work_area.x, this.work_area.y);
        this.dock.show();
        this._hide_dock();
        this.dock_refreshing = false;
    }

    _on_dock_hover() {
        if (this.dock.is_visible() && !this.dock._dashContainer.get_hover()) {
            this.hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DOCK_DELAY, () => {
                if (!this.dock._dashContainer.get_hover() && !Main.panel.get_hover()) {
                    this._hide_dock();
                }
                this.hide_dock_timeout = null;
            });
        }
    }

    _on_panel_hover() {
        if (!this.dock.is_visible() && !Main.overview.visible && !Main.sessionMode.isLocked) {
            if (!global.display.get_focus_window() || !global.display.get_focus_window().is_fullscreen()) {
                this.show_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_DOCK_DELAY, () => {
                    if (Main.panel.get_hover()) {
                        this._show_dock();
                    }
                    this.show_dock_timeout = null;
                });
            }
        }
        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            this.auto_hide_dock_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AUTO_HIDE_DOCK_DELAY, () => {
                if (!this.dock._dashContainer.get_hover() && !Main.panel.get_hover()) {
                    this._hide_dock();
                }
                this.auto_hide_dock_timeout = null;
            });
        }
    }

    _hide_dock() {
        if (this.dock_animated || !this.dock.is_visible()) {
            return;
        }
        this.dock_animated = true;
        this.dock.ease({
            duration: HIDE_DOCK_DURATION,
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
                this.dock.hide();
            },
        });
    }

    _show_dock() {
        if (this.dock_animated || this.dock.is_visible()) {
            return;
        }
        this.dock.show();
        this.dock_animated = true;
        this.dock.ease({
            duration: SHOW_DOCK_DURATION,
            opacity: Math.round(DASH_OPACITY_RATIO * 255),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.dock_animated = false;
            },
        });
    }

    enable() {
        Main.panel.set_track_hover(true);
        this.dock = new Dock();
        this._dock_refresh();
        this.dock.showAppsButton.connect('button-release-event', () => Main.overview.showApps());
        this.dock_hover = this.dock._dashContainer.connect('notify::hover', this._on_dock_hover.bind(this));
        this.panel_hover = Main.panel.connect('notify::hover', this._on_panel_hover.bind(this));
        this.workareas_changed = global.display.connect('workareas-changed', this._dock_refresh.bind(this));
        this.restacked = global.display.connect('restacked', this._hide_dock.bind(this));
        this.main_session_mode_updated = Main.sessionMode.connect('updated', this._dock_refresh.bind(this));
        this.overview_showing = Main.overview.connect('showing', this._hide_dock.bind(this));
    }

    disable() {
        if (this.show_dock_timeout) {
            GLib.source_remove(this.show_dock_timeout);
        }
        if (this.hide_dock_timeout) {
            GLib.source_remove(this.hide_dock_timeout);
        }
        if (this.auto_hide_dock_timeout) {
            GLib.source_remove(this.auto_hide_dock_timeout);
        }
        this.show_dock_timeout = null;
        this.hide_dock_timeout = null;
        this.auto_hide_dock_timeout = null;
        if (this.panel_hover) {
            Main.panel.disconnect(this.panel_hover);
        }
        if (this.workareas_changed) {
            global.display.disconnect(this.workareas_changed);
        }
        if (this.restacked) {
            global.display.disconnect(this.restacked);
        }
        if (this.main_session_mode_updated) {
            Main.sessionMode.disconnect(this.main_session_mode_updated);
        }
        if (this.overview_showing) {
            Main.overview.disconnect(this.overview_showing);
        }
        Main.layoutManager.removeChrome(this.dock);
        this.dock.destroy();
    }
}

function init() {
    return new Extension();
}
