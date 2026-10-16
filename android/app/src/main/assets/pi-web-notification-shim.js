/*
 * Web Notification shim for the Android shell.
 *
 * Android WebView exposes no Web Notification API (`Notification` is undefined,
 * unlike Chrome for Android), while PI WEB drives system notifications through
 * the standard API. This document-start script gives the page the small surface
 * PI WEB uses — `Notification`, `Notification.permission`,
 * `Notification.requestPermission()`, the `body`/`tag` options, and instance
 * `onclick`/`close()` — and forwards every call to the native
 * NotificationManager through the `AndroidNotifications` bridge.
 *
 * Native answers arrive on `window.__piWebNotifyPermission(result)` and
 * `window.__piWebNotifyClick(id)`.
 */
(function () {
  'use strict';

  if (typeof window.Notification !== 'undefined') return;
  var bridge = window.AndroidNotifications;
  if (bridge === undefined || bridge === null) return;

  var nextId = 0;
  var live = Object.create(null);
  var permissionWaiters = [];

  function Notification(title, options) {
    if (!(this instanceof Notification)) return new Notification(title, options);
    var settings = options === undefined || options === null ? {} : options;
    this.title = String(title);
    this.body = settings.body === undefined ? '' : String(settings.body);
    this.tag = settings.tag === undefined ? '' : String(settings.tag);
    this.onclick = null;
    this.onshow = null;
    this.onclose = null;
    this.__piWebNotificationId = String(++nextId);
    live[this.__piWebNotificationId] = this;
    bridge.show(this.__piWebNotificationId, this.tag, this.title, this.body);

    var self = this;
    setTimeout(function () {
      if (typeof self.onshow === 'function') self.onshow();
    }, 0);
  }

  Notification.prototype.close = function () {
    var id = this.__piWebNotificationId;
    if (id === undefined || live[id] === undefined) return;
    delete live[id];
    bridge.close(id, this.tag);
    if (typeof this.onclose === 'function') this.onclose();
  };

  Notification.requestPermission = function () {
    if (bridge.permission() === 'granted') return Promise.resolve('granted');
    return new Promise(function (resolve) {
      permissionWaiters.push(resolve);
      bridge.requestPermission();
    });
  };

  // Read through to the native state on every access: the user can revoke the
  // permission from system settings while the page is open.
  Object.defineProperty(Notification, 'permission', {
    get: function () { return bridge.permission(); },
    configurable: true,
  });

  window.__piWebNotifyPermission = function (result) {
    var waiters = permissionWaiters;
    permissionWaiters = [];
    for (var index = 0; index < waiters.length; index += 1) waiters[index](result);
    return true;
  };

  window.__piWebNotifyClick = function (id) {
    var instance = live[id];
    if (instance === undefined) return false;
    delete live[id];
    if (typeof instance.onclick === 'function') {
      try {
        instance.onclick({ target: instance });
      } catch (error) {
        console.warn('Notification click handler failed', error);
      }
    }
    return true;
  };

  window.Notification = Notification;
})();
