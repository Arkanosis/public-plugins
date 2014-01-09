Genoverse.on('afterInit afterAddTracks afterRemoveTracks', function () {
  for (var i in this.legends) {
    this.legends[i].track.setTracks();
  }
});

Genoverse.on('afterRemoveTracks', function () {
  for (var i in this.legends) {
    this.legends[i].makeImage({});
  }
});

Genoverse.Track.on('afterPositionFeatures', function (features, params) {
  var legend = this.prop('legend');
  
  if (legend) {
    setTimeout(function () { legend.makeImage(params); }, 1);
  }
});

Genoverse.Track.on('afterResize', function (height, userResize) {
  var legend = this.prop('legend');
  
  if (legend && userResize === true) {
    legend.makeImage({});
  }
});

Genoverse.Track.on('afterCheckHeight', function () {
  var legend = this.prop('legend');
  
  if (legend) {
    legend.makeImage({});
  }
});

Genoverse.Track.Legend = Genoverse.Track.Static.extend({
  textColor     : '#000000',
  labels        : 'overlay',
  unsortable    : true,
  featureHeight : 12,
  
  controller: Genoverse.Track.Controller.Static.extend({
    init: function () {
      this.base();
      
      this.tracks = [];
      
      if (!this.browser.legends) {
        this.browser.legends = {};
      }
      
      this.browser.legends[this.track.id] = this;
      this.track.setTracks();
    }
  }),
  
  setTracks: function () {
    var legend = this;
    var type   = this.featureType;
    
    this.tracks = $.grep(this.browser.tracks, function (t) { if (t.type === type) { t.controller.legend = legend.controller; return true; } });
  },
  
  findFeatures: function () {
    var bounds   = { x: this.browser.scaledStart, y: 0, w: this.width };
    var features = {};
    
    $.each($.map(this.track.tracks, function (track) {
      bounds.h = track.prop('height');
      return track.prop('featurePositions').search(bounds).concat(track.prop('labelPositions').search(bounds));
    }), function () {
      if (this.legend) {
        features[this.legend] = this.color;
      }
    });
    
    // sort legend alphabetically
    return $.map(features, function (color, text) { return [[ text, color ]]; }).sort(function (a, b) {
      var x = a[0].toLowerCase();
      var y = b[0].toLowerCase();
      return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    });
  },
  
  positionFeatures: function (f, params) {
    if (params.positioned) {
      return f;
    }
    
    var cols     = 2;
    var pad      = 5;
    var w        = 20;
    var x        = 0;
    var y        = 0;
    var xScale   = this.width / cols;
    var yScale   = this.fontHeight + pad;
    var features = [{ x: 0, y: 0, width: this.width, height: 1, color: this.textColor }];
    var xPos, yPos, labelWidth;
    
    for (var i = 0; i < f.length; i++) {
      xPos       = (x * xScale) + pad;
      yPos       = (y * yScale) + pad;
      labelWidth = this.context.measureText(f[i][0]).width;
      
      features.push(
        { x: xPos,           y: yPos, width: w,              height: this.featureHeight, color: f[i][1] },
        { x: xPos + pad + w, y: yPos, width: labelWidth + 1, height: this.featureHeight, color: false, labelColor: this.textColor, labelWidth: labelWidth, label: f[i][0] }
      );
      
      if (++x === cols) {
        x = 0;
        y++;
      }
    }
    
    params.height     = this.prop('height', ((y + (x ? 1 : 0)) * yScale) + pad);
    params.width      = this.width;
    params.positioned = true;
    
    return this.base(features, params);
  },
  
  destroy: function () {
    delete this.browser.legends[this.id];
    this.base();
  }
});
