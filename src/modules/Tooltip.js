/**
 * Titon: The Mootools UI Framework
 *
 * @copyright	Copyright 2006-2012, Titon
 * @license		http://opensource.org/licenses/mit-license.php - Licensed under the MIT License
 * @link		http://github.com/titon
 */

/**
 * Creates dynamic tooltips that will display at a specific element or the mouse cursor.
 *
 * @version	1.0.0
 * @uses	Titon
 * @uses	Titon.Module
 * @uses	Core
 * @uses	More/Element.Event.Pseudos
 * @uses	More/Element.Position
 */
Titon.Tooltip = new Class({
	Extends: Titon.Module,

	/**
	 * A cache of all AJAX calls, indexed by the URL.
	 */
	cache: {},

	/**
	 * DOM elements.
	 */
	elementHead: null,
	elementBody: null,

	/**
	 * Is the event mode a click?
	 */
	isClick: false,

	/**
	 * Is the tooltip currently visible?
	 */
	isVisible: false,

	/**
	 * Current node that activated the tooltip.
	 */
	node: null,

	/**
	 * Query selector used for tooltip activation.
	 */
	query: null,

	/**
	 * Default options.
	 *
	 *	ajax			- (boolean) The tooltip uses the target as an AJAX call
	 *	fade			- (boolean) Will fade the tooltips in and out
	 *	fadeDuration	- (int) Fade duration in milliseconds
	 *	mode			- (string) Either "hover" or "click"
	 *	className		- (string) Class name to append to a tooltip when it is shown
	 *	position		- (string) The position to display the tooltip over the element
	 *	showLoading		- (boolean) Will display the loading text while waiting for AJAX calls
	 *	showTitle		- (boolean) Will display the element title in the tooltip
	 *	getTitle		- (string) Attribute to read the title from
	 *	getContent		- (string) Attribute to read the content from
	 *	mouseThrottle	- (int) The amount in milliseconds to update mouse hover location
	 *	xOffset			- (int) Additional margin on the X axis
	 *	yOffset			- (int) Additional margin on the Y axis
	 *	delay			- (int) The delay in milliseconds before the tooltip shows
	 *	context			- (element) The element the tooltips will display in (defaults body)
	 *	onHide			- (function) Callback to trigger when a tooltip is hidden
	 *	onLoad			- (function) Callback to trigger when a tooltip content is loaded
	 *	onShow			- (function) Callback to trigger when a tooltip is shown through event
	 *	onPosition		- (function) Callback to trigger when a tooltip is positioned
	 *	titleElement	- (string) CSS query for the title element within the template
	 *	contentElement	- (string) CSS query for the content element within the template
	 *	template		- (string) HTML string template that will be converted to DOM nodes
	 */
	options: {
		ajax: false,
		fade: false,
		fadeDuration: 250,
		mode: 'hover',
		className: '',
		position: 'topRight',
		showLoading: true,
		showTitle: true,
		getTitle: 'title',
		getContent: 'data-tooltip',
		mouseThrottle: 50,
		xOffset: 0,
		yOffset: 0,
		delay: 0,
		context: null,
		onHide: null,
		onLoad: null,
		onShow: null,
		onPosition: null,
		titleElement: '.tooltip-head',
		contentElement: '.tooltip-body',
		template: '<div class="tooltip">' +
			'<div class="tooltip-inner">' +
				'<div class="tooltip-head"></div>' +
				'<div class="tooltip-body"></div>' +
			'</div>' +
			'<div class="tooltip-arrow"></div>' +
		'</div>'
	},

	/**
	 * Custom options per node.
	 */
	customOptions: {},

	/**
	 * Initialize tooltips.
	 *
	 * @param {string} query
	 * @param {object} options
	 */
	initialize: function(query, options) {
		this.parent(options);
		this.query = query;

		// Get elements
		this.elementHead = this.element.getElement(this.options.titleElement);
		this.elementBody = this.element.getElement(this.options.contentElement);

		// Set options
		if (this.options.className) {
			this.element.addClass(this.options.className);
		}

		// Set events
		this.isClick = (this.options.mode !== 'hover');

		var event = (this.isClick ? 'click' : 'mouseenter') + ':relay(' + query + ')',
			callback = this.listen.bind(this);

		$(this.options.context || document.body)
			.removeEvent(event, callback)
			.addEvent(event, callback);
	},

	/**
	 * Callback to position the tooltip at the mouse cursor.
	 *
	 * @param {Event} e
	 */
	follow: function(e) {
		e.stop();

		this.element.setPosition({
			x: (e.page.x + 10 + this.options.xOffset),
			y: (e.page.y + 10 + this.options.yOffset)
		}).fade('show').show();
	},

	/**
	 * Hide the tooltip and set all relevant values to null.
	 */
	hide: function() {
		if (!this.isVisible) {
			return;
		}

		this.isVisible = false;

		if (this.customOptions.className !== this.options.className) {
			this.element.removeClass(this.customOptions.className);
		}

		this.element.removeClass(this.customOptions.position.hyphenate());
		this.customOptions = {};

		this.node.removeEvents('mousemove');
		this.node = null;

		if (this.options.fade) {
			this.element.fadeOut(this.options.fadeDuration, false);
		} else {
			this.element.hide();
		}

		this.fireEvent('hide');
	},

	/**
	 * Event callback for tooltip element mouseover or click.
	 *
	 * @param {Event} e
	 * @param {Element} node
	 */
	listen: function(e, node) {
		if (this.isClick) {
			e.stop();

			if (this.isVisible) {
				this.hide();
				return;
			}
		}

		this.show(node);
	},

	/**
	 * Load the tooltip content with a string.
	 *
	 * @param {string} string
	 */
	loadFromString: function(string) {
		this._position(string);

		this.fireEvent('load');
	},

	/**
	 * Load the tooltip content with a DOM element.
	 *
	 * @param {Element|string} element
	 */
	loadFromDom: function(element) {
		if (typeOf(element) === 'string' && element.substr(0, 1) === '#') {
			element = $(element.remove('#')).get('html');
		}

		this._position(element);

		this.fireEvent('load');
	},

	/**
	 * Load the modal content from an AJAX URL request.
	 *
	 * @param {string} url
	 */
	loadFromUrl: function(url) {
		if (this.cache[url]) {
			this._position(this.cache[url]);

			this.fireEvent('load');

			return;
		}

		new Request({
			url: url,
			method: 'get',
			evalScripts: true,

			onSuccess: function(response) {
				this.cache[url] = response;
				this._position(response);
			}.bind(this),

			onRequest: function() {
				this.fireEvent('load');

				if (this.options.showLoading) {
					this._position(new Element('div.tooltip-loading', { text: Titon.msg.loading }));
				}
			}.bind(this),

			onFailure: function() {
				this.hide();
			}.bind(this)
		}).get();
	},

	/**
	 * Show the tooltip and determine whether to grab the content from an AJAX call,
	 * a DOM node, or plain text. Can pass an options object to overwrite the defaults.
	 *
	 * @param {Element} node
	 * @param {object} options
	 */
	show: function(node, options) {
		node = new Element(node);
		options = Titon.mergeOptions(this.options, node.getOptions('tooltip') || options);

		this.node = node;
		this.customOptions = options;

		var title = this._read('title'),
			content = this._read('content');

		if (title && options.showTitle) {
			this.elementHead.setHtml(title).show();
		} else {
			this.elementHead.hide();
		}

		// Add custom classes
		this.element
			.addClass(options.position.hyphenate())
			.addClass(options.className);

		// Set mouse events
		if (!this.isClick) {
			this.node
				.removeEvent('mouseleave')
				.addEvent('mouseleave', this.hide.bind(this));
		}

		if (options.ajax) {
			this.loadFromUrl(content || this.node.get('href'));

		} else if (content.substr(0, 1) === '#') {
			this.loadFromDom(content);

		} else {
			this.loadFromString(content);
		}

		this.fireEvent('show');
	},

	/**
	 * Positions the tooltip relative to the current node or the mouse cursor.
	 * Additionally will apply the title/text and hide/show if necessary.
	 *
	 * @private
	 * @param {string|Element} content
	 */
	_position: function(content) {
		var options = this.customOptions;

		if (content) {
			this.elementBody.setHtml(content).show();
		} else {
			this.elementBody.hide();
		}

		this.isVisible = true;

		// Follow the mouse
		if (options.position === 'mouse') {
			var callback = this.follow.bind(this),
				event = 'mousemove:throttle(' + this.options.mouseThrottle + ')';

			this.node
				.removeEvent(event, callback)
				.addEvent(event, callback);

			this.fireEvent('position');

		// Position accordingly
		} else {
			var position = options.position,
				edgeMap = {
					topLeft: 'bottomRight',
					topCenter: 'bottomCenter',
					topRight: 'bottomLeft',
					centerLeft: 'centerRight',
					center: 'center',
					centerRight: 'centerLeft',
					bottomLeft: 'topRight',
					bottomCenter: 'topCenter',
					bottomRight: 'topLeft'
				};

			this.element.position({
				relativeTo: this.node,
				position: position,
				edge: edgeMap[position] || 'topLeft',
				offset: {
					x: -options.xOffset,
					y: -options.yOffset
				}
			});

			window.setTimeout(function() {
				if (!this.element.isVisible()) {
					if (this.options.fade) {
						this.element.fadeIn(this.options.fadeDuration);
					} else {
						this.element.show();
					}
				}

				this.fireEvent('position');
			}.bind(this), this.options.delay || 0);
		}
	},

	/**
	 * Attempt to read a value from multiple locations.
	 * DOM storage will always take precedent.
	 *
	 * @private
	 * @param {string} type
	 * @return {string}
	 */
	_read: function(type) {
		var data = this.node.retrieve('tooltip:' + type, null),
			key = (type === 'title') ? this.options.getTitle : this.options.getContent;

		if (data) {
			return data;

		} else if (typeOf(key) === 'function') {
			return key(this.node);

		} else {
			return this.node.get(key);
		}
	}

});

/**
 * All instances loaded via factory().
 */
Titon.Tooltip.instances = {};

/**
 * Easily create multiple instances.
 *
 * @param {string} query
 * @param {object} options
 */
Titon.Tooltip.factory = function(query, options) {
	if (Titon.Tooltip.instances[query]) {
		return Titon.Tooltip.instances[query];
	}

	var instance = new Titon.Tooltip(query, options);

	Titon.Tooltip.instances[query] = instance;

	return instance;
};

/**
 * Hide all instances.
 */
Titon.Tooltip.hide = function() {
	Object.each(Titon.Tooltip.instances, function(tooltip) {
		tooltip.hide();
	});
};