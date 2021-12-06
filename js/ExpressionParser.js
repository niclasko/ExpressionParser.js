/*
* ExpressionParser.js formulae engine
* Copyright (c) 2021 "Niclas Kjall-Ohlsson"
* 
* This file is part of ExpressionParser.js.
* 
* ExpressionParser.js is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* ExpressionParser.js is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with ExpressionParser.js.  If not, see <https://www.gnu.org/licenses/>.
*/
function ExpressionParser() {

	var self = this;
	
	var expression = null;
	var position = 0;
	var tokens = [];
	var token = '';
	
	var parenthesesDepth = 0;

	var allowedVariableCharacters = "abcdefghijlkmnopqrstuvxyzABCDEFGHIJKLMNOPQRSTUVXYZ_";

	var variables = {};
	
	// For Shunting Yard Algorithm
	var expressionStack = [];
	var output = [];
	var operators = [];
	
	var expressionTreeRoot = null;
	var expressionTrees = [];

	var longestListLength = 0;
	
	this.parse = function(_expression) {
		longestListLength = 0;
		expression = _expression;
		if(parseAssignment()) {
			return;
		}
		parseExpression();
		finish();
	};
	
	this.value = function() {
		if(expressionTreeRoot == null) {
			return null;
		}
		var result = [];
		if(longestListLength == 0) {
			longestListLength = 1;
		}
		for(var i=0; i<longestListLength; i++) {
			result.push(expressionTreeRoot.value());
		}
		return result;
	};
	
	this.printTree = function() {
		var output = [];
		printTree(expressionTreeRoot, output, 0);
		return output.join('<br>');
	};
	
	this.expressionTreeRoot = function() {
		return expressionTreeRoot;
	};
	
	this.expression = function() {
		return expression;
	};
	
	var printTree = function(node, output, depth) {
		if(!node) return;
		output.push(Array(depth+1).join('&middot;') + node.token());
		if(node.f().isOperator) {
			printTree(node.lhs, output, depth+1);
			printTree(node.rhs, output, depth+1);
		} else if(node.f().isFunction && node.p && node.p.length > 0) {
			for(var i=0; i<node.p.length; i++) {
				printTree(node.p[i], output, depth+1);
			}
		}
	};

	var parseAssignment = function() {
		if(parseVariable(true)) {
			var variableName = token;
			token = '';
			if(_equals()) {
				skip();
				ignoreWhiteSpace();
				if(!parseExpression()) {
					throw exception("Expected expression.");
				}
				finish();
				setVariable(
					variableName,
					new Variable(expressionTreeRoot)
				);
				return true;
			}
		}
		reset();
		return false;
	};

	this.getVariables = function() {
		return variables;
	};

	var setVariable = function(variableName, value) {
		variables[variableName] = value;
	};

	var newExpression = function() {
		expressionStack.push({
			"output": output,
			"operators": operators,
			"expressionTreeRoot": expressionTreeRoot
		});
		output = [];
		operators = [];
		expressionTreeRoot = null;
	};

	var endExpression = function() {
		var currentExpression = expressionStack.pop();
		output = currentExpression.output;
		operators = currentExpression.operators;
		expressionTreeRoot = currentExpression.expressionTreeRoot;
	};
	
	var parseExpression = function() {
		
		var addedToken = false;
		
		ignoreWhiteSpace();
		
		if(openingParentheses()) {
			
			accumulateLeftParentheses();
			
			if(!parseExpression()) {
				throw exception('Expected token or opening Parentheses.');
			}
			
			if(closingParentheses()) {
				accumulateRightParentheses();
			} else {
				throw exception('Expected closing Parentheses.');
			}
			
			addedToken = true;
			
		} else if(numeric() || negation()) {
			
			addedToken = parseNumber();
			
		} else if(parseFunction()) {
			
			addedToken = true;
			
		} else if(parseVariable()) {
			
			addedToken = true;

		} else if(parseList()) {
			
			addedToken = true;

		} else {
			
			throw exception("Expected token or opening Parentheses.");
			
		}
		
		ignoreWhiteSpace();
		
		if(more() && !parseOperator() && !(closingParentheses() && inParentheses()) && !comma() && !(closingSquareBracket())) {
			throw exception("Expected operator.");
		}
		
		return addedToken;
		
	};
	var parseOperator = function() {
		var accumulateNextN;
		if((accumulateNextN = operator()) > 0) {
			
			accumulate(accumulateNextN);
			addToken(Operator.latestParsed);
			
			if(!parseExpression()) {
				throw exception('Expected token or opening Parentheses.');
			}
			return true;
		}
		return false;
	};
	var parseFunction = function() {
		var accumulateNextN;
		if((accumulateNextN = _function()) > 0) {
			
			accumulate(accumulateNextN);
			
			var parameterCount =
				_Function.latestParsed.parameterCount();
				
			addToken(_Function.latestParsed);
			
			if(parameterCount > 0) {
				if(openingParentheses()) {
			
					accumulateLeftParentheses();
					
					var i = 0;
					while(i < parameterCount) {
						if(!parseExpression()) {
							throw exception('Expected token or opening Parentheses.');
						}
						if(more() && comma()) {
							accumulate();
							addToken(Comma.ref);
						} else if(more() && !comma() && i < parameterCount-1) {
							throw exception('Expected comma.');
						}
						i++;
					}
			
					if(closingParentheses()) {
						accumulateRightParentheses();
					} else {
						throw exception('Expected closing Parentheses.');
					}
			
				}
			}
			
			return true;
		}
		return false;
	};
	var parseNumber = function() {
		if(negation()) {
			accumulate();
		}
		if(numeric()) {
			ignoreWhiteSpace();
			while(numeric()) {
				accumulate();
			}
			if(dot()) {
				accumulate();
				if(numeric()) {
					while(numeric()) {
						accumulate();
					}
				} else {
					throw exception('Expected one or more integers after decimal point.');
				}
			}
			ignoreWhiteSpace();
		} else {
			throw exception('Expected one or more integers.');
		}
		addToken(new Number(parseFloat(token)));
		return true;
	};
	var parseVariable = function(doNotAddToken) {
		while(allowedVariableCharacter() && more()) {
			accumulate();
		}
		if(emptyToken()) {
			return false;
		}
		ignoreWhiteSpace();
		if(doNotAddToken == undefined) {
			addToken(getVariable(token));
		}
		return true;
	};
	var getVariable = function(variableName) {
		if(variables[variableName] == undefined) {
			throw exception('Variable ' + variableName + ' is not defined.');
		}
		var variable = variables[variableName];
		setListStats(variable.node());
		return variable;
	};
	var allowedVariableCharacter = function() {
		return allowedVariableCharacters.indexOf(currentChar()) > -1;
	};
	var parseList = function() {
		if(openingSquareBracket()) {
			skip();
			ignoreWhiteSpace();
			var list = new List();
			while(true) {
				ignoreWhiteSpace();
				newExpression();
				if(!parseExpression()) {
					throw exception("Expected expression.");
				}
				finish(true);
				list.add(expressionTreeRoot.value());
				endExpression();
				setListStats(list);
				if(!comma()) {
					break;
				}
				skip();
			}
			if(closingSquareBracket()) {
				skip();
				addToken(list);
				return true;
			} else {
				throw exception("Expected closing square bracket.");
			}
		}
		return false;
	};
	var setListStats = function(n) {
		var item = n;
		if(n.f) {
			item = n.f();
		}
		if(!item.isList) {
			return;
		}
		item.reset();
		longestListLength = Math.max(item.size(), longestListLength);
	};
	var emptyToken = function() {
		return token.length == 0;
	};
	var currentChar = function() {
		return expression.charAt(position);
	};
	var nextChar = function() {
		return expression.charAt(position+1);
	}
	var openingParentheses = function() {
		return currentChar() == '(';
	};
	var closingParentheses = function() {
		return currentChar() == ')';
	};
	var startParentheses = function() {
		parenthesesDepth++;
	};
	var endParentheses = function() {
		parenthesesDepth--;
	};
	var inParentheses = function() {
		return parenthesesDepth > 0;
	};
	var openingSquareBracket = function() {
		return currentChar() == '[';
	};
	var closingSquareBracket = function() {
		return currentChar() == ']';
	};
	var _equals = function() {
		return currentChar() == '=';
	};
	var negation = function() {
		return currentChar() == '-';
	};
	var dot = function() {
		return currentChar() == '.';
	};
	var _function = function() {
		return _Function.isFunction(expression, position);
	};
	var comma = function() {
		return currentChar() == ',';
	};
	var numeric = function() {
		return !isNaN(parseInt(currentChar()));
	};
	var operator = function() {
		return Operator.isOperator(expression, position);
	};
	var more = function() {
		return position < expression.length;
	};

	var skip = function() {
		position++;
	};
	
	var accumulate = function(accumulateNextN) {
		var accumulated = 0;
		while(accumulated < (!accumulateNextN ? 1 : accumulateNextN)) {
			token += expression.charAt(position++);
			accumulated++;
		}
	};
	var accumulateLeftParentheses = function() {
		accumulate();
		addToken(LeftParentheses.ref);
		startParentheses();
	};
	var accumulateRightParentheses = function() {
		accumulate();
		addToken(RightParentheses.ref);
		endParentheses();
	};
	
	var ignoreWhiteSpace = function() {
		while(expression.charAt(position) == ' ') {
			position++;
		}
	}
	
	var precedenceConditionIsMet = function(atom1, atom2) {
		if(atom1.f().leftAssociativity() && atom1.f().precedence() <= atom2.f().precedence()) {
			return true;
		} else if(atom1.f().rightAssociativity() && atom1.f().precedence() < atom2.f().precedence()) {
			return true;
		}
		return false;
	};
	
	var addToken = function(f) {
		var atom = new Atom(token, f);
		tokens.push(atom);
		token = '';
		
		if(atom.f().isNumber) {
			output.push(atom);
		} else if(atom.f().isVariable) {
			output.push(atom);
		} else if(atom.f().isList) {
			output.push(atom);
		} else if(atom.f().isFunction) {
			operators.push(atom);
		} else if(atom.f().isComma) {
			while(operators.length > 0 && !operators.slice(-1)[0].f().leftParentheses) {
				output.push(operators.pop());
			}
		} else if(atom.f().isOperator) {
			if(operators.length == 0) {
				operators.push(atom);
			} else if(operators.length > 0) {
				while(operators.length > 0 &&
					(operators.slice(-1)[0].f().isOperator || operators.slice(-1)[0].f().isFunction) &&
						precedenceConditionIsMet(atom, operators.slice(-1)[0])) {
					output.push(operators.pop());
				}
				operators.push(atom);
			}
		} else if(atom.f().leftParentheses) {
			operators.push(atom);
		} else if(atom.f().rightParentheses) {
			while(operators.length > 0 && !operators.slice(-1)[0].f().leftParentheses) {
				output.push(operators.pop());
			}
			operators.pop(); // Remove left Parentheses
		}
		
	};
	
	var lastToken = function() {
		if(tokens.length == 0) return null;
		return tokens[tokens.length-1];
	};
	
	var finish = function(doNotResetPosition) {
		while(operators.length != 0) {
			output.push(operators.pop());
		}
		
		// Build expression tree
		var expressionTreeNodes = [];
		for(var i in output) {
			if(output[i].f().isOperator) {
				output[i].rhs = expressionTreeNodes.pop();
				output[i].lhs = expressionTreeNodes.pop();
			} else if(output[i].f().isFunction) {
				output[i].p = [];
				for(var j=0; j<output[i].f().parameterCount(); j++) {
					output[i].p.unshift(expressionTreeNodes.pop());
				}
			}
			expressionTreeNodes.push(output[i]);
		}
		expressionTreeRoot = expressionTreeNodes.pop();
		expressionTrees.push(expressionTreeRoot);
		reset(doNotResetPosition);
	};

	var reset = function(doNotResetPosition) {
		if(!doNotResetPosition) {
			position = 0;
		}
		token = '';
	};

	this.getExpressionTrees = function() {
		return expressionTrees;
	};
	
	var got = function() {
		return " Parsed \"" + expression.substring(0,position) + "\". Got \"" + expression.charAt(position) + "\"";
	};
	
	var exception = function(message) {
		reset();
		return message + got();
	};
	
	function Atom(token, f) {
		var token = token;
		var f = f;
		this.token = function() {
			return token;
		};
		this.f = function() {
			return f;
		};
		this.value = f.value;
	};
	
	var Trie = {
		buildTrie: function(f) {
			var trie = {};
			for(key in f) {
				var displayValue = f[key].displayValue();
		
				var trieNode = trie;
		
				for(var i in displayValue) {
					if(!trieNode[displayValue.charAt(i)]) {
						trieNode[displayValue.charAt(i)] = {};
					}
					trieNode = trieNode[displayValue.charAt(i)];
				}
				trieNode.isF = true;
				trieNode.f = f[key];
			}
			return trie;
		},
		isF: function(what, trie, expression, position) {
			var trieNode = trie;
			var i=position;
			for(;;) {
				if(trieNode[expression.charAt(i)]) {
					trieNode = trieNode[expression.charAt(i)];
					if(trieNode.isF) {
						what.latestParsed = trieNode.f;
						return (i-position)+1;
					}
					i++;
				} else {
					return 0;
				}
			}
		}
	};
	
	Number: {
		function Number(n) {
			this.value = function() { return n; };
			this.isNumber = true;
		};
	};

	List: {
		function List() {
			var list = [];
			var currentIndex = 0;
			this.value = function() {
				if(currentIndex >= list.length) {
					currentIndex = 0;
				}
				return list.length > 0 ? list[currentIndex++] : null;
			};
			this.add = function(item) { list.push(item); }
			this.size = function() { return list.length; }
			this.reset = function() { currentIndex = 0; }
			this.isList = true;
		};
	};

	Variable: {
		function Variable(node) {
			var self = this;
			self.node = function() { return node; }
			self.value = function() { return node.value(); };
			self.isVariable = true;
		};
	};
	
	Parentheses: {
		function LeftParentheses() {
			this.value = function() { return null; };
			this.isParentheses = true;
			this.leftParentheses = true;
		};
		LeftParentheses.ref = new LeftParentheses();
		function RightParentheses() {
			this.value = function() { return null; };
			this.isParentheses = true;
			this.rightParentheses = true;
		};
		RightParentheses.ref = new RightParentheses();
	};
	
	Operator: {
		function Operator(displayValue, precedence, leftAssociativity, valueFunction) {
			var displayValue = displayValue;
			var precedence = precedence;
			var leftAssociativity = leftAssociativity;
			this.value = valueFunction;
			
			this.isOperator = true;
			this.displayValue = function() {
				return displayValue;
			};
			this.precedence = function() {
				return precedence;
			};
			this.leftAssociativity = function() {
				return leftAssociativity;
			};
			this.rightAssociativity = function() {
				return !leftAssociativity;
			};
		};
		Operator.f = {};
		Operator.f.POWER = new Operator("^", 11, false, function() { return Math.pow(this.lhs.value(), this.rhs.value()); });
		Operator.f.MULTIPLY = new Operator("*", 10, true, function() { return this.lhs.value()*this.rhs.value(); });
		Operator.f.DIVIDE = new Operator("/", 10, true, function() { return this.lhs.value()/this.rhs.value(); });
		Operator.f.MODULO = new Operator("%", 10, true, function() { return this.lhs.value()%this.rhs.value(); });
		Operator.f.PLUS = new Operator("+", 9, true, function() { return this.lhs.value()+this.rhs.value(); });
		Operator.f.MINUS = new Operator("-", 9, true, function() { return this.lhs.value()-this.rhs.value(); });
		Operator.f.GREATER_THAN = new Operator(">", 8, true, function() { return this.lhs.value()>this.rhs.value(); });
		Operator.f.LESS_THAN = new Operator("<", 8, true, function() { return this.lhs.value()<this.rhs.value(); });
		Operator.f.GREATER_THAN_OR_EQUALS = new Operator(">=", 8, true, function() { return this.lhs.value()>=this.rhs.value(); });
		Operator.f.LESS_THAN_OR_EQUALS = new Operator("<=", 8, true, function() { return this.lhs.value()<=this.rhs.value(); });
		Operator.f.EQUALS = new Operator("==", 7, true, function() { return this.lhs.value()==this.rhs.value(); });
		Operator.f.NOT_EQUALS = new Operator("!=", 7, true, function() { return this.lhs.value()!=this.rhs.value(); });
		Operator.f.IS = new Operator("IS", 7, true, function() { return this.lhs.value()==this.rhs.value(); });
		Operator.f.AND = new Operator("AND", 6, true, function() { return this.lhs.value()&&this.rhs.value(); });
		Operator.f.OR = new Operator("OR", 5, true, function() { return this.lhs.value()||this.rhs.value(); });
		Operator.f.NONE = new Operator("NONE", -1, true, null);

		Operator.trie = Trie.buildTrie(Operator.f);
		Operator.latestParsed = null;
		Operator.isOperator = function(expression, position) {
			return Trie.isF(Operator, Operator.trie, expression, position);
		};
	};
	
	_Function: {
		function _Function(displayValue, parameterCount, valueFunction) {
			var displayValue = displayValue;
			var parameterCount = parameterCount;
			this.value = valueFunction;
			this.isFunction = true;
			this.displayValue = function() {
				return displayValue;
			};
			this.parameterCount = function() {
				return parameterCount;
			};
			this.precedence = function() {
				return 12;
			};
			this.leftAssociativity = function() {
				return true;
			};
			this.rightAssociativity = function() {
				return !leftAssociativity;
			};
		}
		_Function.f = {};
		_Function.f.PI = new _Function("PI", 0, function() { return Math.PI; });
		_Function.f.E = new _Function("E", 0, function() { return Math.E; });
		_Function.f.sqrt = new _Function("sqrt", 1, function() { return Math.sqrt(this.p[0].value()); });
		_Function.f.log = new _Function("log", 2, function() { return Math.log(this.p[0].value())/(this.p[1].value() ? Math.log(this.p[1].value()) : 1); });
		_Function.f.ln = new _Function("ln", 1, function() { return Math.log(this.p[0].value()); });
		_Function.f.sin = new _Function("sin", 1, function() { return Math.sin(this.p[0].value()); });
		_Function.f.cos = new _Function("cos", 1, function() { return Math.cos(this.p[0].value()); });
		
		_Function.trie = Trie.buildTrie(_Function.f);
		_Function.latestParsed = null;
		_Function.isFunction = function(expression, position) {
			return Trie.isF(_Function, _Function.trie, expression, position);
		};
	};
	
	Comma: {
		function Comma() {
			this.isComma = true;
		};
		Comma.ref = new Comma();
	}
	
}
