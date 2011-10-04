/*
 * cucumber.js: Methods for directly running features against a Cucumber layout.
 *
 * (C) 2011 Paul Covell (paul@done.com)
 * MIT LICENSE
 *
 */
var kyuri = require('kyuri'),
  fs = require('fs');

var missing_steps = [];

/**
  Run the matching step definition, if any
*/
var _executeStepDefinition = function (steps, step, callback) {
  var stepContext, fn, matches;
  
  steps.forEach(function (rule) {
    if (!fn) {
      matches = step.match(rule.pattern);
      if (matches) {
        fn = rule.generator;
      } else {
        if (missing_steps.indexOf(step) === (-1)) {
          missing_steps.push(step);
        }
      }
    };
  });
  
  stepContext = {
    done : callback,
    pending : callback,
  };
  
  if (fn) {
    matches = matches.slice(1);
    matches.unshift(stepContext);
    fn.apply(this, matches);
    return true;
  } else {
    stepContext.pending();
  }
};

/**
  Map function over each item in the array in order, calling callback when complete
  fn = function (item, callback)
*/
var _invokeAsync = function (ar, fn, callback) {
  (function (ar, fn, callback) {
    var context = this,
      i = -1;

    function _callback(err) {
      i += 1;
      if (!err && i < ar.length) {
        fn.call(context, ar[i], _callback);
      } else {
        callback(err);
      }
    };

    _callback();
  }).call(this, ar, fn, callback);
};

/**
  Runs the parsed feature files provided with the steps 
*/
exports.run = function (features, steps, callback) {
  _invokeAsync(features, function (feature, featureCb) {
    var feature = feature[Object.keys(feature).shift()];
    _invokeAsync(feature.scenarios, function (scenario, scenarioCb) {
      if (scenario.outline) {
        scenarioCb();
      } else {
        _invokeAsync(scenario.breakdown, function(step, stepCb) {
          var step = step[Object.keys(step).shift()],
            text = step.join(' ');

          _executeStepDefinition(steps, step[1], stepCb);
        }, scenarioCb);
      }
    }, featureCb);
  }, 
  function (err) {
    if (missing_steps.length > 0) {
      console.log('Missing Steps');
      console.log(missing_steps.join('\n'));
    }
    callback(err);
  });
};

//** NEED TO ADD EVENTEMITTER FOR beforeTest, afterTest, beforeBackground **//