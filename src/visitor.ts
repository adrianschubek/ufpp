import {
  ASTNode,
  CaseStatement,
  Comment,
  EvalStatement,
  FileStatement,
  FunctionCall,
  FunctionDefinition,
  IfStatement,
  LoopStatement,
  MatchStatement,
  Params,
  Program,
  Raw,
  URLStatement,
  UseStatement,
} from "./ast";
import { BuiltInFunction, assertCount, assertFnArgCount, assertFnArgRange, assertParamCount, err as trueErr, truthy, warn } from "./common";

function err(msg: string, node: ASTNode): never {
  return trueErr(msg, ...rowcol(node));
}

export interface Visitor<T> {
  visitProgram(node: Program): T;
  visitRaw(node: Raw): T;
  visitFunctionCall(node: FunctionCall): T;
  visitFunctionDefinition(node: FunctionDefinition): T;
  visitParams(node: Params): T;
  visitIfStatement(node: IfStatement): T;
  visitMatchStatement(node: MatchStatement): T;
  visitCaseStatement(node: CaseStatement): T;
  visitLoopStatement(node: LoopStatement): T;
  visitURLStatement(node: URLStatement): T;
  visitFileStatement(node: FileStatement): T;
  visitUseStatement(node: UseStatement): T;
  visitEvalStatement(node: EvalStatement): T;
  visitComment(node: Comment): T;
}

interface DeclaredFunction {
  fnArgs: string[];
  fnBody: ASTNode;
}
interface InterpreterOptions {
  ignoreOverride: boolean;
}

export function interpret(program: ASTNode /* , config: cfg */): string {
  const intp = new Interpreter();
  return program.accept(intp);
}

export class Interpreter implements Visitor<string> {
  parent: Interpreter | null = null;
  functions = new Map<string, DeclaredFunction>();
  options: InterpreterOptions = {
    ignoreOverride: false,
  };

  visitProgram(node: Program): string {
    let output = "";
    for (const child of node.body) {
      output += child.accept(this);
    }
    return output;
  }
  visitRaw(node: Raw): string {
    return node.value;
  }
  visitFunctionCall(node: FunctionCall): string {
    const fnName = node.name;
    const args = node.args.map((arg) => arg.accept(this));
    // const args = node.args;
    // const parsedArgs: string[] = [];
    const fnParams = decode<{ [key: string]: string | null }>(node.params.accept(this));
    // params are available as {foo: 123} => $PARAM_FOO -> 123

    // const isVar = fnName.startsWith("$");
    // const isEval = fnName.endsWith("!");
    // if isEval convert arguments from Raw to EvalStatement:
    // -> do not evaluate arguments
    // -> before: args.0.prog.raw --> args.0.prog.eval    assert args.0.prog.length === 1 !!!
    // nei ngehört hier garnicht rein sondern in parser!!

    // check for built-in functions (except if,f,loop,..). cannot be overridden
    let declaredFn: DeclaredFunction | undefined;
    switch (fnName) {
      // Do not <cmd>! her. instead define them in code stdlib!!
      case BuiltInFunction.VAR:
        // case BuiltInFunction.VAR + "!": // \var!{raw}{raw/eval} for eval version simpyl rewrite
        // Set a variable
        assertFnArgCount(node, fnName, 2, args);
        assertParamCount(node, fnName, 0, node.params);
        validateNameNoBuiltin(args[0], node);
        // validateNameNoBuiltin(newVar, node);

        // if (isEval) {
        // } else {
        // }

        this.functions.set(`\$${args[0]}`, {
          fnArgs: [],
          fnBody: new Raw(args[1], ...rowcol(node)),
          // fnBody: isEval ? new EvalStatement(args[1], ...rowcol(node)) : new Raw(args[1], ...rowcol(node)),
        });
        return "";
      case BuiltInFunction.TOPARENT: // \toparent{funcname} copy fun to parent scope
        assertFnArgCount(node, fnName, 1, args);
        assertParamCount(node, fnName, 0, node.params);
        validateNameNoBuiltin(args[0], node);

        // fetch from current scope
        declaredFn = this.functions.get(args[0]);
        if (declaredFn === undefined) {
          if (this.functions.has("\\$" + args[0].slice(1)))
            warn(
              `${args[0]} was not found in current scope but a variable \\\$${args[0]} exists. Perhaps you meant to call this one.`,
              ...rowcol(node)
            );
          else warn(`${args[0]} was not found in current scope.`, ...rowcol(node));
          return "";
        }

        if (this.parent === null) {
          warn(`Cannot move ${args[0]} to parent scope. No parent scope exists`, ...rowcol(node));
          return "";
        }

        // copy to top parent scope
        this.parent.functions.set(args[0], declaredFn);
        return "";
      case BuiltInFunction.TOCHILD: // \tochild{funcname} copy fun from parent to child scope (this)
        assertFnArgCount(node, fnName, 1, args);
        assertParamCount(node, fnName, 0, node.params);
        validateNameNoBuiltin(args[0], node);

        // fetch from parent scope
        if (this.parent === null) {
          warn(`Cannot move ${args[0]} to child scope. No parent scope exists`, ...rowcol(node));
          return "";
        }

        declaredFn = this.parent.functions.get(args[0]);
        if (declaredFn === undefined) {
          warn(`${args[0]} was not found in parent scope`, ...rowcol(node));
          return "";
        }

        // copy to child scope
        this.functions.set(args[0], declaredFn);
        return "";
      case BuiltInFunction.DEL: // \delf{funcname} remove function from current scope
        assertFnArgCount(node, fnName, 1, args);
        assertParamCount(node, fnName, 0, node.params);
        validateNameNoBuiltin(args[0], node);

        if (!this.functions.delete(args[0])) {
          warn(`${args[0]} was not found in current scope`, ...rowcol(node));
        }
        return "";
      case BuiltInFunction.HALT:
        assertFnArgRange(node, fnName, 0, 1, args);
        assertParamCount(node, fnName, 0, node.params);
        err("Execution halted" + (args[0] ? ". " + args[0] : ""), node);
      default:
        // check for declared functions
        // args.map((arg) => arg.accept(this));
        declaredFn = this.functions.get(fnName);
    }

    // check parent scope for function
    if (declaredFn === undefined && this.parent) return this.parent.visitFunctionCall(node);
    if (declaredFn === undefined) {
      if (this.functions.has(`\$${fnName}`)) {
        err(`\\${fnName} was not found in current scope but a variable \\\$${fnName} exists. Perhaps you meant to call this one.`, node);
      } else if (this.functions.has(`\\${fnName}`)) {
        //FIXME:
        err(`\\\$${fnName} was not found in current scope but a function \\${fnName} exists. Perhaps you meant to call this one.`, node);
      } else {
        err(`Function \\${fnName} is undefined`, node);
      }
    }

    // check for argument count
    if (args.length !== declaredFn.fnArgs.length) assertCount("arguments", `in function \\${fnName}`, node, declaredFn.fnArgs.length, args);

    // new scope (new interpreter) with variables as $functions
    const newScope = new Interpreter();
    newScope.parent = this;
    // push arguments to new scope as [foo,...] => [$foo,...]
    for (let i = 0; i < declaredFn.fnArgs.length; i++) {
      // variables == functions
      newScope.functions.set(`\$${declaredFn.fnArgs[i]}`, { fnArgs: [], fnBody: new Raw(args[i], ...rowcol(node)) });
    }
    // push params to new scope as {foo: 123} => $p_foo -> 123
    for (const key in fnParams) {
      newScope.functions.set(`\$p_${key}`, { fnArgs: [], fnBody: new Raw(fnParams[key] ?? "", ...rowcol(node)) });
    }

    // also create positional arguments $1, $2, ...
    // and do with pareamete \f[minarg=0,maxargs=5]...

    return declaredFn.fnBody.accept(newScope);
  }
  visitFunctionDefinition(node: FunctionDefinition): string {
    const fnName = node.name.accept(this);
    // check for banned function names
    validateNameNoDollar(fnName, node.name);
    validateNameNoBuiltin(fnName, node.name);

    const decodedArgs = decode<{ [key: string]: string | null }>(node.fnArgs.accept(this));
    const fnArgs = Object.keys(decodedArgs);
    const fnBody = node.body; // unvisited yet

    this.functions.set(fnName, { fnArgs, fnBody }); // FIXME <-- pollutes this global scope with fnArgs
    // TODO: easy fix prepend and late rremove function name like $foo:arg1

    return "";
  }
  visitParams(node: Params): string {
    const map: { [key: string]: string | null } = {};
    for (const key in node.kv) {
      const value = node.kv[key];
      map[key] = value?.accept(this) ?? null;
    }
    return encode(map);
  }
  visitIfStatement(node: IfStatement): string {
    const cond = node.condition.accept(this);
    if (truthy(cond)) return node.trueBranch.accept(this);
    if (node.falseBranch !== undefined) return node.falseBranch.accept(this);
    return "";
  }
  visitLoopStatement(node: LoopStatement): string {
    const init = node.init.accept(this);
    const cond = node.condition.accept(this);
    const increment = node.increment.accept(this);
    const body = node.body.accept(this);

    throw new Error("Method not implemented.");
  }
  visitURLStatement(node: URLStatement): string {
    throw new Error("Method not implemented.");
  }
  visitFileStatement(node: FileStatement): string {
    throw new Error("Method not implemented.");
  }
  visitUseStatement(node: UseStatement): string {
    throw new Error("Method not implemented.");
  }
  visitEvalStatement(node: EvalStatement): string {
    const js = node.expr;
    // get variables starting with $ from functions
    const context: { [key: string]: string | null } = {};
    for (const [key, value] of this.functions) {
      // console.log(key, value);
      if (key.startsWith("$")) {
        context[key] = value.fnBody.accept(this);
      }
    }

    return evaluate(js, context);
  }
  visitComment(node: Comment): string {
    return "";
  }
}

function encode<T>(s: T): string {
  return JSON.stringify(s);
}

function decode<T>(s: string): T {
  return JSON.parse(s) as T;
}

function rowcol(token: ASTNode): [number, number] {
  return [token.row, token.col];
}

function evaluate(code: string, context: { [key: string]: string | null }): string {
  // replace all $<val> with context[val]
  for (const [key, value] of Object.entries(context)) {
    code = code.replaceAll(key, value ?? "");
  }

  return Function(`return ${code};`)();

  // ---
  // function escapeVariable(val: string | null): string {
  //   if (val === null) return "";
  //   if (!val.includes('"')) return '"' + val + '"';
  //   if (!val.includes("'")) return "'" + val + "'";
  //   if (!val.includes("`")) return "`" + val + "`";
  //   warn(`Could not escape variable ${val}. Tried all seperators but none is compatible.`);
  //   return val;
  // }

  // // only include variables that are used in the code
  // const usedVariables = Object.entries(context).filter(([key, _]) => code.includes(key));

  // // if suffix :escape -> escape the variable
  // usedVariables.forEach(([key, value]) => {
  //   if (code.includes(key + ":escape")) {
  //     code = code.replaceAll(key + ":escape", escapeVariable(value));
  //   }
  // });
  // console.log(code)

  // const template = `${usedVariables.map(([key, value]) => `let ${key} = ${value};`).join("\n")}
  //   return ${code};`;
  // console.log("_____________________");
  // console.log(template);
  // console.log("_____________________");
  // return Function(template)();
}

/**
 * Forbidden names
 */
function validateNameNoBuiltin(name: string, node: ASTNode) {
  if (Object.values(BuiltInFunction).includes(name as BuiltInFunction)) err(`Built-in function \\${name} cannot be modified`, node);
}
/**
 * no start with $
 */
function validateNameNoDollar(name: string, node: ASTNode) {
  if (name.startsWith("$")) err(`Function \\${name} cannot start with "$"`, node);
}

/**
 * \x{123}{let x = \foo{}}
 * Treat args from start to end as EvalStatement instead of Rawstatement (if not already a EvalStatement)
 * --> \x{`123`}{`let x = \foo{}`}
 *
 *   if should eval convert arguments from Raw to EvalStatement:
 *    -> do not evaluate arguments
 *    -> before: args.0.prog.raw --> args.0.prog.eval    assert args.0.prog.length === 1 !!!
 * @deprecated
 */
function rewriteArgsProgramAsEvalIfNeeded<T>(
  args: ASTNode[] = [],
  evalStartIndex: number = 0,
  evalEndIndex: number = args.length - 1,
  visitor: Visitor<T>
): string {
  let output = "";
  for (const arg of args) {
    if (evalStartIndex <= 0 && evalEndIndex >= 0) {
      output += arg.accept(visitor);
    }
  }
  return output;
}
