/*
 * cucumber.js: Methods for directly running features against a Cucumber layout.
 *
 * (C) 2011 Paul Covell (paul@done.com)
 * MIT LICENSE
 *
 */
var kyuri = require('kyuri'),
  fs = require('fs'),
  util = require('util'),
  colors = require('colors'),
  lingo = require('lingo'),
  EventEmitter = require('events').EventEmitter;
  
var log = console.log;

var Cucumber = function () {
  EventEmitter.call(this);
  this.missingSteps = {};
  this.scenarios = { 
    total: 0,
    passed: 0,
    failed: 0
  };
  this.steps = {
    total: 0,
    passed: 0,
    pending: 0,
    undefined: 0,
    failed: 0
  };
  this.runtime = {
    start: 0,
    stop: 0
  }
};
util.inherits(Cucumber, EventEmitter);

/**
  Runs the parsed feature files provided with the steps 
*/
Cucumber.prototype.run = function (features, steps, callback) {
  var self = this;
  
  function runFeatures (features, next) {
    self._invokeSerial(features, function (feature, featureCb) {
      var feature = feature[Object.keys(feature).shift()];      
      runScenarios(feature, featureCb);
    }, next);
  }
  
  function runBackground (feature, next) {
    if (feature.background) {
      self._emitAndWait('beforeBackground', function() {
        self._invokeSerial(feature.background.breakdown, runStep, next);
      });
    } else {
      next();
    }
  }
  
  function runScenarios (feature, next) {
    
    function complete(callback) {
      return function (err) {
        if (err) {
          self.scenarios.failed += 1;
        } else {
          self.scenarios.passed += 1;
        }
        callback(err);
      }
    }
    
    self._invokeSerial(feature.scenarios, function (scenario, scenarioCb) {
      self.scenarios.total += 1;
      
      if (scenario.outline) {
        self._invokeSerial(scenario.examples, function (example, exampleCb) {
          var steps = []
          
          // Create customized steps by replacing the template steps with
          // the example variables
          scenario.breakdown.forEach(function (step) {
            var exampleStep = {};
            Object.keys(step).forEach(function (i) {
              exampleStep[i] = step[i].slice(0); // copy the array
              scenario.exampleVariables.forEach(function (variable) {
                exampleStep[i][1] = exampleStep[i][1].replace('\<' + variable + '\>', example[variable]);
              });
            });
            steps.push(exampleStep);
          });
          
          runBackground(feature, function (err) {
            self._invokeSerial(steps, runStep, exampleCb);
          });
        }, complete(scenarioCb));
      } else {
        runBackground(feature, function (err) {
          self._invokeSerial(scenario.breakdown, runStep, complete(scenarioCb));
        });
      }
    }, next);
  }
  
  function runStep (step, next) {
    var step = step[Object.keys(step).shift()];
    self._executeStepDefinition(steps, step, next);
  }
  
  self._emitAndWait('beforeTest', function () {
    self.runtime.start = new Date();
    runFeatures(features, function (err) {
      self.runtime.stop = new Date();
      self._emitAndWait('afterTest', function() {
        self._printSummary();
        callback(err);        
      });
    });
  });
};



/*
TO DO

Feature: Ask Entry
  In order to create a new ask
  A user
  Should be able to enter the request

  Scenario: Basic creation
    When I visit the "asks" page
    And I enter "tutor me in math" in "title"
    And I enter "west village, before Friday" in "info"
    And I enter "paul at done.com" in "email"
    And I press "go"
    Then I should see "tutor me in math" in my asks

1 scenarios (1 passed, 1 undefined)
6 steps (5 passed, 1 undefined)
0m8.635s

You can implement step definitions for undefined steps with these snippets:

var Steps = require('cucumis').Steps;

Steps.Then(/^I should see "([^"]*?)" in my asks$/, function (ctx, arg1) {
	ctx.pending();
});

Steps.export(module);
*/

/**
  Print test run summary information
*/
Cucumber.prototype._printSummary = function () {
  var self = this,
      stepResults = [],
      scenarioResults = [],
      totalTime, ms;
  
  function formatStep(type, color) {
    if (self.steps[type]) {
      stepResults.push((self.steps[type] + ' ' + type)[color]);
    }
  }
  
  function formatScenario(type, color) {
    if (self.scenarios[type]) {
      scenarioResults.push((self.scenarios[type] + ' ' + type)[color]);
    }
  }

  formatStep('passed', 'green');
  formatStep('undefined', 'yellow');
  formatStep('pending', 'yellow');
  formatStep('failed', 'red');
  
  formatScenario('passed', 'green');
  formatScenario('failed', 'red');
  
  log(this.scenarios.total + ' scenarios (' + scenarioResults.join(', ') + ')');
  log(this.steps.total + ' steps (' + stepResults.join(', ') + ')');
  
  totalTime = this.runtime.stop - this.runtime.start;
  ms = (totalTime % 1000) / 1000;
  
  log(Math.floor(totalTime / 1000 / 60) + 'm' + Math.floor(totalTime / 1000) + '.' + (ms === 0 ? '000' : ms.toString().slice(2)) + 's');
  
  this._printMissingSteps();
};

Cucumber.prototype._printMissingSteps = function () {
  var self = this,
    formattedMissingSteps = {};
  
  function _yellow(text) {
    log(text.yellow);
  }
  
  function _replaceVars(text) {
    var update;
    
    update = text.replace(/\d+/g, '(\\d+)');
    update = update.replace(/\"[^"]*?\"/g, '"([^"]*?)"');
    return update;
  }
  
  if (Object.keys(self.missingSteps).length > 0) {
    // Prepare the text output, and also ensure that we don't print steps that resolve
    // to the same pattern more than once by indexing the new hash on the pattern
    Object.keys(self.missingSteps).forEach(function (key) {
      var step = self.missingSteps[key],
        pattern = '/^' + _replaceVars(step[1]) + '$/',
        fn = lingo.camelcase(step[0].toString().toLowerCase(), true),
        args = ['step'],
        matches;
        
      matches = pattern.match(/\([^)]*\)/g);
      if (matches) {
        for(var i = 0; i < matches.length; i++) {
          args.push('arg' + (i + 1));
        }
      }
      formattedMissingSteps[pattern] = { fn: fn, args: args };
    });
    
    _yellow('');
    _yellow('You can implement step definitions for undefined steps with these snippets:');
    _yellow('');
    _yellow("var Steps = require('kyuri').Steps;");
    _yellow('');
    Object.keys(formattedMissingSteps).forEach(function (pattern) {
      var step = formattedMissingSteps[pattern];
      _yellow('Steps.' + step.fn + '(' + pattern + ', function (' + step.args.join(', ') + ') {');
      _yellow('\tstep.pending();');
      _yellow('});')
      _yellow('');
    });
    _yellow('Steps.export(module);');
  }
};

/**
  Run the matching step definition, if any
*/
Cucumber.prototype._executeStepDefinition = function (steps, step, callback) {
  var stepContext, fn, matches;
  var self = this;
  
  steps.forEach(function (rule) {
    if (!fn) {
      matches = step[1].match(rule.pattern);
      if (matches) {
        fn = rule.generator;
      } else {
        self.missingSteps[step.join(' ')] = step;
      }
    };
  });
  
  stepContext = {
    done : function (err) {
      if (err) {
        self.steps.failed += 1;
      } else {
        self.steps.passed += 1;
      }
      callback(err);
    },
    pending : function () {
      self.steps.pending += 1;
      callback();
    }
  };
  
  self.steps.total += 1;
  if (fn) {
    matches = matches.slice(1);
    matches.unshift(stepContext);
    
    try {
      fn.apply(this, matches);
    } catch (err) {
      stepContext.done(err);
    }
  } else {
    self.steps.undefined += 1;
    callback();
  }
};

/**
  Map function over each item in the array in order, calling callback when complete
  fn = function (item, callback)
*/
Cucumber.prototype._invokeSerial = function (ar, fn, callback) {
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
  Emit the event and wait for all listeners to call the callback
*/
Cucumber.prototype._emitAndWait = function (event, callback) {
  var count = this.listeners(event).length;
  
  if (count === 0) {
    callback();
  } else {
    this.emit(event, function () {
      count -= 1;
      if (count === 0) {
        callback();
      }
    });
  }
};

/**
  Invoke function with all items in the array, calling callback when complete
  fn = function (item, callback)
*/
Cucumber.prototype._invokeParallel = function (ar, fn, callback) {
  (function (ar, fn, callback) {
    var context = this,
      count = 0;
      
    ar.forEach(function (item) {
      fn.call(context, item, function (err) {
        count += 1;
        if (count >= ar.length) {
          callback();
        }
      });
    });
  }).call(this, ar, fn, callback);
};

module.exports = new Cucumber();