var $         = jQuery; // Make sure we have local $ (this is for combined script in a function)
var Genoverse = Base.extend({
  // Defaults
  urlParamTemplate   : 'r=__CHR__:__START__-__END__', // Overwrite this for your URL style
  width              : 1000,
  height             : 200,
  labelWidth         : 90,
  buffer             : 1,
  longestLabel       : 30,
  defaultLength      : 5000,
  defaultScrollDelta : 100,
  tracks             : [],
  plugins            : [],
  dragAction         : 'scroll', // options are: scroll, select, off
  wheelAction        : 'off',    // options are: zoom, off
  genome             : undefined,
  autoHideMessages   : true,
  trackAutoHeight    : false,
  colors             : {
    background       : '#FFFFFF',
    majorGuideLine   : '#CCCCCC',
    minorGuideLine   : '#E5E5E5',
    sortHandle       : '#CFD4E7'
  },

  // Default coordinates for initial view, overwrite in your config
  chr   : 1,
  start : 1,
  end   : 1000000,

  constructor: function (config) {
    var browser = this;
    
    if (!this.supported()) {
      return this.die('Your browser does not support this functionality');
    }
    
    config.container = $(config.container); // Make sure container is a jquery object, jquery recognises itself automatically
    
    if (!(config.container && config.container.length)) {
      config.container = $('<div id="genoverse">').appendTo('body');
    }

    $.extend(this, config);
    
    $.when(this.loadGenome(), this.loadPlugins()).always(function () {
      Genoverse.wrapFunctions(browser);
      browser.init();
    });
  },

  loadGenome: function () {
    if (typeof this.genome === 'string') {
      var genomeName = this.genome;
      
      return $.ajax({
        url      : this.origin + 'js/genomes/' + genomeName + '.js', 
        dataType : 'script',
        context  : this,
        success  : function () {
          try {
            this.genome = eval(genomeName);
          } catch (e) {
            console.log(e);
            this.die('Unable to load genome ' + genomeName);
          }
        }
      });
    }
  },

  loadPlugins: function () {
    if (typeof LazyLoad === 'undefined') {
      return;
    }
    
    var browser         = this;
    var loadPluginsTask = $.Deferred();
    
    // Load plugins css file
    $.when.apply($, $.map(browser.plugins, function (plugin) {
      var dfd = $.Deferred();
      
      LazyLoad.css(browser.origin + 'css/' + plugin + '.css', function () {
        $.ajax({
          url      : browser.origin + 'js/plugins/' + plugin + '.js',
          dataType : 'text',
          success  : dfd.resolve
        });
      });
      
      return dfd;
    })).done(function () {
      (function (jq, scripts) {
        // Localize variables
        var $ = jq;
        
        for (var i = 0; i < scripts.length; i++) {
          try {
            eval(scripts[i][0]);
          } catch (e) {
            // TODO: add plugin name to this message
            console.log('Error evaluating plugin script: ' + e);
            console.log(scripts[i][0]);
          }
        }
      })($, browser.plugins.length === 1 ? [ arguments ] : arguments);
    }).always(loadPluginsTask.resolve);
    
    return loadPluginsTask;
  },
  
  init: function () {
    var width = this.width;
    
    this.addDomElements(width);
    this.addUserEventHandlers();
    
    this.tracksById       = {};
    this.prev             = {};
    this.urlParamTemplate = this.urlParamTemplate || '';
    this.useHash          = typeof window.history.pushState !== 'function';
    this.textWidth        = document.createElement('canvas').getContext('2d').measureText('W').width;
    this.labelWidth       = this.labelContainer.outerWidth(true);
    this.wrapperLeft      = this.labelWidth - width;
    this.width           -= this.labelWidth;
    this.paramRegex       = this.urlParamTemplate ? new RegExp('([?&;])' + this.urlParamTemplate
      .replace(/(\b(\w+=)?__CHR__(.)?)/,   '$2([\\w\\.]+)$3')
      .replace(/(\b(\w+=)?__START__(.)?)/, '$2(\\d+)$3')
      .replace(/(\b(\w+=)?__END__(.)?)/,   '$2(\\d+)$3') + '([;&])'
    ) : '';
    
    var urlCoords = this.getURLCoords();
    var coords    = urlCoords.chr && urlCoords.start && urlCoords.end ? urlCoords : { chr: this.chr, start: this.start, end: this.end };
    
    this.chr = coords.chr;
    
    if (this.genome && !this.chromosomeSize) {
      this.chromosomeSize = this.genome[this.chr].size;
    }
    
    this.addTracks();
    this.setRange(coords.start, coords.end);
  },
  
  addDomElements: function (width) {
    var browser = this;
    
    this.menus          = $();
    this.labelContainer = $('<ul class="label_container">').appendTo(this.container).sortable({
      items       : 'li:not(.unsortable)',
      handle      : '.handle',
      placeholder : 'label',
      axis        : 'y',
      helper      : 'clone',
      cursor      : 'move',
      update      : $.proxy(this.updateTrackOrder, this),
      start       : function (e, ui) {
        ui.placeholder.css({ height: ui.item.height(), visibility: 'visible', background: browser.colors.sortHandle }).html(ui.item.html());
        ui.helper.hide();
      }
    });
    
    this.wrapper          = $('<div class="gv_wrapper">').appendTo(this.container);
    this.selector         = $('<div class="selector crosshair">').appendTo(this.wrapper);
    this.selectorControls = $(
      '<div class="selector_controls">'               +
      '  <button class="zoomHere">Zoom here</button>' +
      '  <button class="center">Center</button>'      +
      '  <button class="summary">Summary</button>'    +
      '  <button class="cancel">Cancel</button>'      +
      '</div>'
    ).appendTo(this.selector);
    
    this.zoomInHighlight = $(
      '<div class="canvas_zoom i">' +
      '  <div class="t l h"></div>' +
      '  <div class="t r h"></div>' +
      '  <div class="t l v"></div>' +
      '  <div class="t r v"></div>' +
      '  <div class="b l h"></div>' +
      '  <div class="b r h"></div>' +
      '  <div class="b l v"></div>' +
      '  <div class="b r v"></div>' +
      '</div>'
    ).appendTo('body');
    
    this.zoomOutHighlight = this.zoomInHighlight.clone().toggleClass('i o').appendTo('body');
    
    this.container.addClass('canvas_container').width(width);
  },
  
  addUserEventHandlers: function () {
    var browser = this;
    
    this.container.on({
      mousedown: function (e) {
        browser.hideMessages();

        // Only scroll on left click, and do nothing if clicking on a button in selectorControls
        if ((!e.which || e.which === 1) && !(this === browser.selector[0] && e.target !== this)) {
          browser.mousedown(e);
        }
        
        return false;
      },
      mousewheel: function (e, delta, deltaX, deltaY) {
        if (browser.noWheelZoom) {
          return true;
        }
        
        browser.hideMessages();

        if (deltaY === 0 && deltaX !== 0) {
          browser.startDragScroll(e);
          browser.move(-deltaX * 10);
          browser.stopDragScroll(false);          
        } else if (browser.wheelAction === 'zoom') {
          return browser.mousewheelZoom(e, delta);
        }
      },
      dblclick: function (e) {
        browser.hideMessages();
        browser.mousewheelZoom(e, 1);
      }
    }, '.image_container, .selector');
    
    this.selectorControls.on('click', function (e) {
      var pos = browser.getSelectorPosition();
      
      switch (e.target.className) {
        case 'summary'  : browser.summary(pos.start, pos.end); break;
        case 'zoomHere' : browser.setRange(pos.start, pos.end, true); break;
        case 'center'   : browser.moveTo(pos.start, pos.end, true, true);
        case 'cancel'   : browser.cancelSelect(); break;
        default         : break;
      }
    });
    
    $(document).on({
      'mouseup.genoverse'    : $.proxy(this.mouseup,   this),
      'mousemove.genoverse'  : $.proxy(this.mousemove, this),
      'keydown.genoverse'    : $.proxy(this.keydown,   this),
      'keyup.genoverse'      : $.proxy(this.keyup,     this),
      'mousewheel.genoverse' : function (e) {
        if (browser.wheelAction === 'zoom') {
          if (browser.wheelTimeout) {
            clearTimeout(browser.wheelTimeout);
          }
          
          browser.noWheelZoom  = browser.noWheelZoom || e.target !== browser.container[0];
          browser.wheelTimeout = setTimeout(function () { browser.noWheelZoom = false; }, 300);
        }
      }
    });
    
    $(window).on(this.useHash ? 'hashchange.genoverse' : 'popstate.genoverse', $.proxy(this.popState, this));
  },
  
  onTracks: function () {
    var args = $.extend([], arguments);
    var func = args.shift();
    var mvc;
    
    for (var i = 0; i < this.tracks.length; i++) {
      mvc = this.tracks[i]._interface[func];
      
      if (mvc) {
        this.tracks[i][mvc][func].apply(this.tracks[i][mvc], args);
      } else if (this.tracks[i][func]) {
        this.tracks[i][func].apply(this.tracks[i], args);
      }
    }
  },
  
  reset: function () {
    this.onTracks('reset');
    this.scale = 9e99; // arbitrary value so that setScale resets track scales as well
    this.setRange(this.start, this.end);
  },
  
  setWidth: function (width) {
    this.width       = width;
    this.wrapperLeft = this.labelWidth - width;
    this.width      -= this.labelWidth;
    
    this.container.width(width);
    this.onTracks('setWidth', this.width);
    this.reset();
  },
  
  mousewheelZoom: function (e, delta) {
    var browser = this;
    
    clearTimeout(this.zoomDeltaTimeout);
    clearTimeout(this.zoomTimeout);
    
    this.zoomDeltaTimeout = setTimeout(function () {
      if (delta > 0) {
        browser.zoomInHighlight.css({ left: e.pageX - 20, top: e.pageY - 20, display: 'block' }).animate({
          width: 80, height: 80, top: '-=20', left: '-=20'
        }, {
          complete: function () { $(this).css({ width: 40, height: 40, display: 'none' }); }
        });
      } else {
        browser.zoomOutHighlight.css({ left: e.pageX - 40, top: e.pageY - 40, display: 'block' }).animate({
          width: 40, height: 40, top: '+=20', left: '+=20'
        }, {
          complete: function () { $(this).css({ width: 80, height: 80, display: 'none' }); }
        });
      }
    }, 100);
    
    this.zoomTimeout = setTimeout(function () {
      browser[delta > 0 ? 'zoomIn' : 'zoomOut'](e.pageX - browser.container.offset().left - browser.labelWidth);
      
      if (browser.dragAction === 'select') {
        browser.moveSelector(e);
      }
    }, 300);
    
    return false;
  },
  
  startDragScroll: function (e) {
    this.dragging    = 'scroll';
    this.scrolling   = !e;
    this.dragOffset  = e ? e.pageX - this.left : 0;
    this.dragStart   = this.start;
    this.scrollDelta = Math.max(this.scale, this.defaultScrollDelta);
  },
  
  stopDragScroll: function (update) {
    this.dragging  = false;
    this.scrolling = false;
    
    if (update !== false) {
      if (this.start !== this.dragStart) {
        this.updateURL();
      }
      
      this.checkTrackHeights();
    }
  },
  
  startDragSelect: function (e) {
    if (!e) {
      return false;
    }
    
    var x = Math.max(0, e.pageX - this.wrapper.offset().left - 2);
    
    this.dragging        = 'select';
    this.selectorStalled = false;
    this.selectorStart   = x;
    
    this.selector.css({ left: x, width: 0 }).removeClass('crosshair');
    this.selectorControls.hide();
  },
  
  stopDragSelect: function (e) {
    if (!e) {
      return false;
    }
    
    this.dragging        = false;
    this.selectorStalled = true;
    
    if (this.selector.outerWidth(true) < 2) { 
      return this.cancelSelect();
    }
    
    // Calculate the position, so that selectorControls appear near the mouse cursor
    var top = Math.min(e.pageY - this.wrapper.offset().top, this.wrapper.outerHeight(true) - 1.2 * this.selectorControls.outerHeight(true));

    this.selectorControls.css({
      top  : top,
      left : this.selector.outerWidth(true) / 2 - this.selectorControls.outerWidth(true) / 2
    }).show();
  },
  
  cancelSelect: function (keepDragging) {
    if (!keepDragging) {
      this.dragging = false;
    }
    
    this.selectorStalled = false;
    
    this.selector.addClass('crosshair').width(0);
    this.selectorControls.hide();
    
    if (this.dragAction === 'scroll') {
      this.selector.hide();
    }
  },
  
  dragSelect: function (e) {
    var x = e.pageX - this.wrapper.offset().left;

    if (x > this.selectorStart) {
      this.selector.css({ 
        left  : this.selectorStart, 
        width : Math.min(x - this.selectorStart, this.width - this.selectorStart - 1)
      });
    } else {
      this.selector.css({ 
        left  : Math.max(x, 1), 
        width : Math.min(this.selectorStart - x, this.selectorStart - 1)
      });
    }    
  },
  
  setDragAction: function (action, keepSelect) {
    this.dragAction = action;
    
    if (this.dragAction === 'select') {
      this.selector.addClass('crosshair').width(0).show();
    } else if (keepSelect && !this.selector.hasClass('crosshair')) {
      this.selectorStalled = false;
    } else {
      this.cancelSelect();
      this.selector.hide();
    }
  },
  
  toggleSelect: function (on) {
    if (on) {
      this.prev.dragAction = 'scroll';
      this.setDragAction('select');
    } else {
      this.setDragAction(this.prev.dragAction, true);
      delete this.prev.dragAction;
    }
  },
  
  setWheelAction: function (action) {
    this.wheelAction = action;
  },
  
  keydown: function (e) {
    if (e.which === 16 && !this.prev.dragAction && this.dragAction === 'scroll') { // shift key
      this.toggleSelect(true);
    } else if (e.which === 27) { // escape key
      this.cancelSelect();
      this.closeMenus();
    }
  },
  
  keyup: function (e) {
    if (e.which === 16 && this.prev.dragAction) { // shift key
      this.toggleSelect();
    }
  },
  
  mousedown: function (e) {
    if (e.shiftKey) {
      if (this.dragAction === 'scroll') {
        this.toggleSelect(true);
      }
    } else if (this.prev.dragAction) {
      this.toggleSelect();
    }
    
    switch (this.dragAction) {
      case 'select' : this.startDragSelect(e); break;
      case 'scroll' : this.startDragScroll(e); break;
      default       : break;
    }
  },
 
  mouseup: function (e, update) {
    if (!this.dragging) {
      return false;
    }
    
    switch (this.dragging) {
      case 'select' : this.stopDragSelect(e);      break;
      case 'scroll' : this.stopDragScroll(update); break;
      default       : break;
    }
  },
  
  mousemove: function (e) {
    if (this.dragging && !this.scrolling) {
      switch (this.dragAction) {
        case 'scroll' : this.move(e.pageX - this.dragOffset - this.left); break;
        case 'select' : this.dragSelect(e); break;
        default       : break;
      }
    } else if (this.dragAction === 'select') {
      this.moveSelector(e);
    }
  },
  
  moveSelector: function (e) {
    if (!this.selectorStalled) {
      this.selector.css('left', e.pageX - this.wrapper.offset().left - 2);
    }
  },
  
  move: function (delta) {
    var scale = this.scale;
    var start, end, left;
    
    if (scale > 1) {
      delta = Math.round(delta / scale) * scale; // Force stepping by base pair when in small regions
    }
    
    left = this.left + delta;
    
    if (left <= this.minLeft) {
      left  = this.minLeft;
      delta = this.minLeft - this.left;
    } else if (left >= this.maxLeft) {
      left  = this.maxLeft;
      delta = this.maxLeft - this.left;
    }
    
    start = Math.max(Math.round(this.start - delta / scale), 1);
    end   = start + this.length - 1;
    
    if (end > this.chromosomeSize) {
      end   = this.chromosomeSize;
      start = end - this.length + 1;
    }
    
    this.left = left;

    if (start !== this.dragStart) {
      this.closeMenus();
      this.cancelSelect(true);
    }
    
    this.onTracks('move', delta);
    this.setRange(start, end);
  },
  
  moveTo: function (start, end, update, keepLength) {
    this.setRange(start, end, update, keepLength);
    
    if (this.prev.scale === this.scale) {
      this.onTracks('moveTo', this.start, this.end, (this.prev.start - this.start) * this.scale);
    }
  },
  
  setRange: function (start, end, update, keepLength) {
    this.prev.start = this.start;
    this.prev.end   = this.end;
    this.start      = Math.max(typeof start === 'number' ? Math.floor(start) : parseInt(start, 10), 1);
    this.end        = Math.min(typeof end   === 'number' ? Math.floor(end)   : parseInt(end,   10), this.chromosomeSize);
    
    if (this.end < this.start) {
      this.end = Math.min(this.start + this.defaultLength - 1, this.chromosomeSize);
    }
    
    if (keepLength && this.end - this.start + 1 !== this.length) {
      if (this.end === this.chromosomeSize) {
        this.start = this.end - this.length + 1;
      } else {
        var center = (this.start + this.end) / 2;
        this.start = Math.max(Math.floor(center - this.length / 2), 1);
        this.end   = this.start + this.length - 1;
      }
    } else {
      this.length = this.end - this.start + 1;
    }
    
    this.setScale();
    
    if (update === true && (this.prev.start !== this.start || this.prev.end !== this.end)) {
      this.updateURL();
    }
  },
  
  setScale: function () {
    this.prev.scale  = this.scale;
    this.scale       = this.width / this.length;
    this.scaledStart = this.start * this.scale;
    
    if (this.prev.scale !== this.scale) {
      this.left        = 0;
      this.minLeft     = Math.round((this.end   - this.chromosomeSize) * this.scale);
      this.maxLeft     = Math.round((this.start - 1) * this.scale);
      this.labelBuffer = Math.ceil(this.textWidth / this.scale) * this.longestLabel;

      if (this.prev.scale) {
        this.cancelSelect();
        this.closeMenus();
      }
      
      this.onTracks('setScale');
      this.onTracks('makeFirstImage');
    }
  },
  
  checkTrackHeights: function () {
    if (this.dragging) {
      return;
    }
    
    this.onTracks('checkHeight');
  },
  
  resetTrackHeights: function () {
    this.onTracks('resetHeight');
  },
  
  zoomIn: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = Math.round(this.start + x / (2 * this.scale));
    var end   = this.length === 2 ? start : Math.round(start + (this.length - 1) / 2);
    
    this.setRange(start, end, true);
  },
  
  zoomOut: function (x) {
    if (!x) {
      x = this.width / 2;
    }
    
    var start = Math.round(this.start - x / this.scale);
    var end   = this.length === 1 ? start + 1 : Math.round(start + 2 * (this.length - 1));
    
    this.setRange(start, end, true);
  },
  
  
  addTrack: function (track, index) {
    return this.addTracks([ track ], index)[0];
  },
  
  addTracks: function (tracks, index) {
    var defaults = {
      browser : this,
      width   : this.width
    };
    
    var push = !!tracks;
    
    tracks = tracks || $.extend([], this.tracks);
    index  = index  || 0;
    
    for (var i = 0; i < tracks.length; i++) {
      tracks[i] = new tracks[i]($.extend(defaults, { index: i + index }));
      
      if (tracks[i].id) {
        this.tracksById[tracks[i].id] = tracks[i];
      }
      
      if (push) {
        this.tracks.push(tracks[i]);
        
        if (this.scale) {
          tracks[i].controller.setScale(); // scale will only be set for tracks added after initalisation
          tracks[i].controller.makeFirstImage();
        }
      } else {
        this.tracks[i] = tracks[i];
      }
    }
    
    this.sortTracks();
    
    return tracks;
  },
  
  removeTrack: function (track) {
    this.removeTracks([ track ]);
  },
  
  removeTracks: function (tracks) {
    var i = tracks.length;
    var j;
    
    while (i--) {
      j = this.tracks.length;
      
      while (j--) {
        if (tracks[i] === this.tracks[j]) {
          this.tracks.splice(j, 1);
          break;
        }
      }
      
      if (tracks[i].id) {
        delete this.tracksById[tracks[i].id];
      }
      
      tracks[i].destructor(); // Destroy DOM elements and track itself
    }
  },
  
  sortTracks: function () {
    if ($.grep(this.tracks, function (t) { return typeof t !== 'object'; }).length) {
      return;
    }
    
    var sorted     = $.extend([], this.tracks).sort(function (a, b) { return a.order - b.order; });
    var labels     = $();
    var containers = $();
    
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].prop('menus').length) {
        sorted[i].prop('top', sorted[i].prop('container').position().top);
      }
      
      labels.push(sorted[i].prop('label')[0]);
      containers.push(sorted[i].prop('container')[0]);
    }
    
    this.labelContainer.append(labels);
    this.wrapper.append(containers);
    
    // Correct the order
    this.tracks = sorted;
    
    labels.map(function () { return $(this).data('track'); }).each(function () {
      if (this.prop('menus').length) {
        var diff = this.prop('container').position().top - this.prop('top');
        this.prop('menus').css('top', function (i, top) { return parseInt(top, 10) + diff; });
        this.prop('top', null);
      }
    }); 
    
    sorted = labels = containers = null;
  },
  
  updateTrackOrder: function (e, ui) {
    var track = ui.item.data('track');
    
    var p = ui.item.prev().data('track').prop('order') || 0;
    var n = ui.item.next().data('track').prop('order') || 0;
    var o = p || n;
    var order;
    
    if (Math.floor(n) === Math.floor(p)) {
      order = p + (n - p) / 2;
    } else {
      order = o + (p ? 1 : -1) * (Math.round(o) - o || 1) / 2;
    }
    
    track.prop('order', order);
    
    this.sortTracks();
  },
  
  updateURL: function () {
    if (this.urlParamTemplate) {
      if (this.useHash) {
        window.location.hash = this.getQueryString();
      } else {
        window.history.pushState({}, '', this.getQueryString());
      }
    }
  },
  
  popState: function () {
    var coords = this.getURLCoords();
    var start  = parseInt(coords.start, 10);
    var end    = parseInt(coords.end,   10);
    
    if (coords.start && !(start === this.start && end === this.end)) {
      // FIXME: a back action which changes scale or a zoom out will reset tracks, since scrollStart will not be the same as it was before
      this.moveTo(start, end);
    }
    
    this.closeMenus();
    this.hideMessages();
  },
  
  getURLCoords: function () {
    var match  = ((this.useHash ? window.location.hash.replace(/^#/, '?') || window.location.search : window.location.search) + '&').match(this.paramRegex);
    var coords = {};
    var i      = 0;
    
    if (!match) {
      return coords;
    }
    
    match = match.slice(2, -1);
    
    $.each(this.urlParamTemplate.split('__'), function () {
      var tmp = this.match(/^(CHR|START|END)$/);
      
      if (tmp) {
        coords[tmp[1].toLowerCase()] = tmp[1] === 'CHR' ? match[i++] : parseInt(match[i++], 10);
      }
    });
    
    return coords;
  },
  
  getQueryString: function () {
    var location = this.urlParamTemplate
      .replace('__CHR__',   this.chr)
      .replace('__START__', this.start)
      .replace('__END__',   this.end);
    
    return this.useHash ? location : window.location.search ? (window.location.search + '&').replace(this.paramRegex, '$1' + location + '$5').slice(0, -1) : '?' + location;
  },
  
  supported: function () {
    var el = document.createElement('canvas');
    return !!(el.getContext && el.getContext('2d'));
  },
  
  die: function (error, el) {
    if (el && el.length) {
      el.html(error);
    } else {
      alert(error);
    }
    
    this.failed = true;
  },
  
  menuTemplate: $('<div class="gv_menu"><div class="close">x</div><table></table></div>').on('click', function (e) {
    if ($(e.target).hasClass('close')) {
      $(this).fadeOut('fast', function () { 
        var data = $(this).data();
        
        if (data.track) {
          data.track.prop('menus', data.track.prop('menus').not(this));
        }
        
        data.browser.menus = data.browser.menus.not(this);
      });
    }
  }),
  
  makeMenu: function (feature, event, track) {
    if (!feature.menuEl) {
      var menu = this.menuTemplate.clone(true).data('browser', this);
      
      $.when(track ? track.controller.populateMenu(feature) : feature).done(function (feature) {
        if (Object.prototype.toString.call(feature) !== '[object Array]') {
          feature = [ feature ];
        }
        
        feature.every(function (f) {
          $('table', menu).append(
            (f.title ? '<tr class="header"><th colspan="2" class="title">' + f.title + '</th></tr>' : '') +
            $.map(f, function (value, key) {
              if (key !== 'title') {
                return '<tr><td>'+ key +'</td><td>'+ value +'</td></tr>';
              }
            }).join()
          );
          
          return true;
        });
        
        if (track) {
          menu.addClass(track.id).data('track', track);
        }
      });
      
      feature.menuEl = menu;
    }
    
    this.menus = this.menus.add(feature.menuEl);
    
    if (track) {
      track.prop('menus', track.prop('menus').add(feature.menuEl));
    }
    
    feature.menuEl.appendTo('body');
    
    if (event) {
      feature.menuEl.css({ left: 0, top: 0 }).position({ of: event, my: 'left top', collision: 'flipfit' });
    }

    return feature.menuEl.show();
  },
  
  closeMenus: function () {
    this.menus.filter(':visible').children('.close').trigger('click');
    this.menus = $();
  },
  
  hideMessages: function () {
    if (this.autoHideMessages) {
      this.wrapper.find('.message_container').addClass('collapsed');
    }
  },
  
  getSelectorPosition: function () {
    var left  = this.selector.position().left;
    var width = this.selector.outerWidth(true);
    var start = Math.round(left / this.scale) + this.start;
    var end   = Math.round((left + width) / this.scale) + this.start - 1;
        end   = end <= start ? start : end;
    
    return { start: start, end: end, left: left, width: width };
  },
  
  // Provide summary of a region (as a popup menu)
  summary: function (start, end) {
    alert(
      'Not implemented' + "\n" +
      'Start: ' + start + "\n" +
      'End: '   + end   + "\n"
    );
  },
  
  saveConfig: $.noop,
  
  systemEventHandlers: {}
}, {
  on: function (events, handler) {
    $.each(events.split(' '), function () {
      if (typeof Genoverse.prototype.systemEventHandlers[this] === 'undefined') {
        Genoverse.prototype.systemEventHandlers[this] = [];
      }
      
      Genoverse.prototype.systemEventHandlers[this].push(handler);
    });
  },
  
  wrapFunctions: function (obj) {
    // Push all before* and after* functions to systemEventHandlers array
    for (var key in obj) {
      if (typeof obj[key] === 'function' && key.match(/^(before|after)/)) {
        obj.systemEventHandlers[key] = obj.systemEventHandlers[key] || [];
        obj.systemEventHandlers[key].push(obj[key]);
      }
    }
    
    // Wrap it up
    for (key in obj) {
      if (typeof obj[key] === 'function' && !key.match(/^(base|extend|constructor|loadPlugins|loadGenome|controller|model|view)$/)) {
        Genoverse.functionWrap(key, obj);
      }
    }
  },
  
  /**
   * functionWrap - wraps event handlers and adds debugging functionality
   **/
  functionWrap: function (key, obj) {
    var name = (obj ? (obj.name || 'Track' + (obj.type || '')) : 'Genoverse') + '.' + key;
    
    if (key.match(/^(before|after|__original)/)) {
      return;
    }
    
    var func = key.substring(0, 1).toUpperCase() + key.substring(1);
    
    if (obj.debug) {
      Genoverse.debugWrap(obj, key, name, func);
    }
    
    // turn function into system event, enabling eventHandlers for before/after the event
    if (obj.systemEventHandlers['before' + func] || obj.systemEventHandlers['after' + func]) {
      obj['__original' + func] = obj[key];
      
      obj[key] = function () {
        var i, rtn;
        
        if (this.systemEventHandlers['before' + func]) {
          for (i = 0; i < this.systemEventHandlers['before' + func].length; i++) {
            // TODO: Should it end when beforeFunc returned false??
            this.systemEventHandlers['before' + func][i].apply(this, arguments);
          }
        }
        
        rtn = this['__original' + func].apply(this, arguments);
        
        if (this.systemEventHandlers['after' + func]) {
          for (i = 0; i < this.systemEventHandlers['after' + func].length; i++) {
            // TODO: Should it end when afterFunc returned false??
            this.systemEventHandlers['after' + func][i].apply(this, arguments);
          }
        }
        
        return rtn;
      };
    }
  },
  
  debugWrap: function (obj, key, name, func) {
    // Debugging functionality
    // Enabled by "debug": true || { functionName: true, ...} option
    // if "debug": true, simply log function call
    if (obj.debug === true) {
      if (!obj.systemEventHandlers['before' + func]) {
        obj.systemEventHandlers['before' + func] = [];
      }
      
      obj.systemEventHandlers['before' + func].unshift(function () {
        console.log(name);
      });
    }
    
    // if debug: { functionName: true, ...}, log function time
    if (typeof obj.debug === 'object' && obj.debug[key]) {
      if (!obj.systemEventHandlers['before' + func]) {
        obj.systemEventHandlers['before' + func] = [];
      }
      
      if (!obj.systemEventHandlers['after' + func]) {
        obj.systemEventHandlers['after' + func] = [];
      }
      
      obj.systemEventHandlers['before' + func].unshift(function () {
        //console.log(name, arguments);        
        console.time('time: ' + name);
      });
      
      obj.systemEventHandlers['after' + func].push(function () {
        console.timeEnd('time: ' + name);
      });
    }
  }
});

Genoverse.prototype.origin = ($('script:last').attr('src').match(/(.*)js\/\w+/) || [])[1];

if (typeof LazyLoad !== 'undefined') {
  LazyLoad.css(Genoverse.prototype.origin + 'css/genoverse.css');
}

String.prototype.hashCode = function () {
  var hash = 0;
  var chr;
  
  if (!this.length) {
    return hash;
  }
  
  for (var i = 0; i < this.length; i++) {
    chr  = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return '' + hash;
};

window.Genoverse = Genoverse;
