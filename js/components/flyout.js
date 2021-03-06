/**
 * @copyright   2010-2015, The Titon Project
 * @license     http://opensource.org/licenses/BSD-3-Clause
 * @link        http://titon.io
 */

define([
    'jquery',
    './component',
    '../flags/vendor',
    '../extensions/shown-selector'
], function($, Toolkit, vendor) {

Toolkit.Flyout = Toolkit.Component.extend({
    name: 'Flyout',
    version: '2.0.0',

    /** Current URL to generate a flyout menu for. */
    current: null,

    /** Collection of flyout elements indexed by URL. */
    menus: {},

    /** Raw sitemap JSON data. */
    data: [],

    /** Data indexed by URL. */
    dataMap: {},

    /** Show and hide timers. */
    timers: {},

    /**
     * Initialize the flyout. A URL is required during construction.
     *
     * @param {jQuery} nodes
     * @param {String} url
     * @param {Object} [options]
     */
    constructor: function(nodes, url, options) {
        this.nodes = $(nodes);
        this.options = options = this.setOptions(options);

        if (options.mode === 'click') {
            this.addEvent('click', 'document', 'onShowToggle', '{selector}');
        } else {
            this.addEvents([
                ['mouseenter', 'document', 'onShowToggle', '{selector}'],
                ['mouseenter', 'document', 'onEnter', '{selector}'],
                ['mouseleave', 'document', 'onLeave', '{selector}']
            ]);
        }

        this.initialize();

        // Load data from the URL
        if (url) {
            $.getJSON(url, this.load.bind(this));
        }
    },

    /**
     * Remove all the flyout menu elements and timers before destroying.
     */
    destructor: function() {
        $.each(this.menus, function(i, menu) {
            menu.remove();
        });

        this.clearTimer('show');
        this.clearTimer('hide');
    },

    /**
     * Clear a timer by key.
     *
     * @param {String} key
     */
    clearTimer: function(key) {
        clearTimeout(this.timers[key]);
        delete this.timers[key];
    },

    /**
     * Hide the currently shown menu.
     */
    hide: function() {
        // Must be called even if the menu is hidden
        if (this.node) {
            this.node.removeClass('is-active');
        }

        if (!this.isVisible()) {
            return;
        }

        this.fireEvent('hiding');

        this.element.conceal();

        this.fireEvent('hidden');

        // Reset last
        this.element = this.current = null;
    },

    /**
     * Return true if the current menu exists and is visible.
     *
     * @returns {bool}
     */
    isVisible: function() {
        if (this.current && this.menus[this.current]) {
            this.element = this.menus[this.current];
        }

        return (this.element && this.element.is(':shown'));
    },

    /**
     * Load the data into the class and save a mapping of it.
     *
     * @param {Object} data
     * @param {Number} [depth]
     */
    load: function(data, depth) {
        depth = depth || 0;

        // If root, store the data
        if (depth === 0) {
            this.data = data;
        }

        // Store the data indexed by URL
        if (data.url) {
            this.dataMap[data.url] = data;
        }

        if (data.children) {
            for (var i = 0, l = data.children.length; i < l; i++) {
                this.load(data.children[i], depth + 1);
            }
        }
    },

    /**
     * Position the menu below the target node.
     */
    position: function() {
        var target = this.current,
            options = this.options;

        if (!this.menus[target]) {
            return;
        }

        this.fireEvent('showing');

        var menu = this.menus[target],
            height = menu.outerHeight(),
            coords = this.node.offset(),
            x = coords.left + options.xOffset,
            y = coords.top + options.yOffset + this.node.outerHeight(),
            windowScroll = $(window).height();

        // If menu goes below half page, position it above
        if (y > (windowScroll / 2)) {
            y = coords.top - options.yOffset - height;
        }

        menu.css({
            left: x,
            top: y
        }).reveal();

        this.fireEvent('shown');
    },

    /**
     * Show the menu below the node.
     *
     * @param {jQuery} node
     */
    show: function(node) {
        var target = this._getTarget(node);

        // When jumping from one node to another
        // Immediately hide the other menu and start the timer for the current one
        if (this.current && target !== this.current) {
            this.hide();
            this.startTimer('show', this.options.showDelay);
        }

        this.node = $(node);

        // Find the menu, else create it
        if (!this._getMenu()) {
            return;
        }

        this.node.addClass('is-active');

        // Display immediately if click
        if (this.options.mode === 'click') {
            this.position();
        }
    },

    /**
     * Add a timer that should trigger a function after a delay.
     *
     * @param {String} key
     * @param {Number} delay
     * @param {Array} [args]
     */
    startTimer: function(key, delay, args) {
        this.clearTimer(key);

        var func;

        if (key === 'show') {
            func = this.position;
        } else {
            func = this.hide;
        }

        if (func) {
            this.timers[key] = setTimeout(function() {
                func.apply(this, args || []);
            }.bind(this), delay);
        }
    },

    /**
     * Build a nested list menu using the data object.
     *
     * @private
     * @param {jQuery} parent
     * @param {Object} data
     * @returns {jQuery}
     */
    _buildMenu: function(parent, data) {
        if (!data.children || !data.children.length) {
            return null;
        }

        var options = this.options,
            menu = $(options.template).attr('role', 'menu'),
            groups = [],
            ul,
            li,
            tag,
            limit = options.itemLimit,
            i, l;

        if (options.className) {
            menu.addClass(options.className);
        }

        if (parent.is('body')) {
            menu.addClass('is-root');
        } else {
            menu.aria('expanded', false);
        }

        if (limit && data.children.length > limit) {
            i = 0;
            l = data.children.length;

            while (i < l) {
                groups.push(data.children.slice(i, i += limit));
            }
        } else {
            groups.push(data.children);
        }

        for (var g = 0, group, child; group = groups[g]; g++) {
            ul = $('<ul/>');

            for (i = 0, l = group.length; i < l; i++) {
                child = group[i];

                // Build tag
                if (child.url) {
                    li = $('<li/>');
                    tag = $('<a/>', {
                        text: child.title,
                        href: child.url,
                        role: 'menuitem'
                    });

                    // Add icon
                    $('<span/>').addClass(child.icon || 'caret-right').prependTo(tag);

                } else {
                    li = $(options.headingTemplate);
                    tag = $('<span/>', {
                        text: child.title,
                        role: 'presentation'
                    });
                }

                if (child.attributes) {
                    tag.attr(child.attributes);
                }

                // Build list
                if (child.className) {
                    li.addClass(child.className);
                }

                li.append(tag).appendTo(ul);

                if (child.children && child.children.length) {
                    this._buildMenu(li, child);

                    li.addClass('has-children')
                        .aria('haspopup', true)
                        .on('mouseenter', this.onPositionChild.bind(this, li))
                        .on('mouseleave', this.onHideChild.bind(this, li));
                }
            }

            menu.append(ul);
        }

        menu.appendTo(parent).conceal();

        // Only monitor top level menu
        if (options.mode !== 'click' && parent.is('body')) {
            menu.on({
                mouseenter: function() {
                    this.clearTimer('hide');
                }.bind(this),
                mouseleave: function() {
                    this.startTimer('hide', options.hideDelay);
                }.bind(this)
            });
        }

        return menu;
    },

    /**
     * Get the menu if it exists, else build it and set events.
     *
     * @private
     * @returns {jQuery}
     */
    _getMenu: function() {
        var target = this._getTarget();

        this.current = target;

        if (this.menus[target]) {
            return this.menus[target];
        }

        if (this.dataMap[target]) {
            var menu = this._buildMenu($('body'), this.dataMap[target]);

            if (!menu) {
                return null;
            }

            return this.menus[target] = menu;
        }

        return null;
    },

    /**
     * Get the target URL to determine which menu to show.
     *
     * @private
     * @param {jQuery} [node]
     * @returns {String}
     */
    _getTarget: function(node) {
        node = $(node || this.node);

        return this.readValue(node, this.options.getUrl) || node.attr('href');
    },

    /**
     * Event handle when a mouse enters a node. Will show the menu after the timer.
     *
     * @private
     */
    onEnter: function() {
        this.clearTimer('hide');
        this.startTimer('show', this.options.showDelay);
    },

    /**
     * Event handler to hide the child menu after exiting parent li.
     *
     * @private
     * @param {jQuery} parent
     */
    onHideChild: function(parent) {
        parent = $(parent);
        parent.removeClass('is-open');
        parent.children(this.ns('menu'))
            .removeAttr('style')
            .aria({
                expanded: false,
                hidden: false
            })
            .conceal();

        this.fireEvent('hideChild', [parent]);
    },

    /**
     * Event handle when a mouse leaves a node. Will hide the menu after the timer.
     *
     * @private
     */
    onLeave: function() {
        this.clearTimer('show');
        this.startTimer('hide', this.options.showDelay);
    },

    /**
     * Event handler to position the child menu dependent on the position in the page.
     *
     * @private
     * @param {jQuery} parent
     */
    onPositionChild: function(parent) {
        var menu = parent.children(this.ns('menu'));

        if (!menu) {
            return;
        }

        menu.aria({
            expanded: true,
            hidden: true
        });

        // Alter width because of columns
        var children = menu.children();

        menu.css('width', (children.outerWidth() * children.length) + 'px');

        // Get sizes after menu positioning
        var win = $(window),
            winHeight = win.height() + win.scrollTop(),
            winWidth = win.width(),
            parentTop = parent.offset().top,
            parentHeight = parent.outerHeight(),
            parentRight = parent.offset().left + parent.outerWidth();

        // Display menu horizontally on opposite side if it spills out of viewport
        var hWidth = parentRight + menu.outerWidth();

        if (hWidth >= winWidth) {
            menu.addClass('push-left');
        } else {
            menu.removeClass('push-left');
        }

        // Reverse menu vertically if below half way fold
        if (parentTop > (winHeight / 2)) {
            menu.css('top', '-' + (menu.outerHeight() - parentHeight) + 'px');
        } else {
            menu.css('top', 0);
        }

        parent.addClass('is-open');
        menu.reveal();

        this.fireEvent('showChild', [parent]);
    },

    /**
     * Event handler to show the menu.
     *
     * @param {jQuery.Event} e
     * @private
     */
    onShowToggle: function(e) {

        // Flyouts shouldn't be usable on touch devices
        if (Toolkit.isTouch) {
            return;
        }

        // Set the current element
        this.isVisible();

        // Trigger the parent
        Toolkit.Component.prototype.onShowToggle.call(this, e);
    }

}, {
    mode: 'hover',
    getUrl: 'href',
    xOffset: 0,
    yOffset: 0,
    showDelay: 350,
    hideDelay: 1000,
    itemLimit: 15,
    template: '<div class="' + vendor + 'flyout" data-flyout-menu></div>',
    headingTemplate: '<li class="' + vendor + 'flyout-heading"></li>'
});

Toolkit.create('flyout', function(url, options) {
    return new Toolkit.Flyout(this, url, options);
}, true);

return Toolkit;
});