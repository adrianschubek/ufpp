import {
  ASTNode,
  Raw,
  Program,
  FunctionCall,
  Params,
  Comment,
  EvalExpr,
  FunctionDefinition,
  IfStatement,
  LoopStatement,
  URLStatement,
  FileStatement,
  UseStatement,
} from "./ast";
import { BuiltInFunction, Token, TokenType, assertCount, assertRange, assertType, err } from "./common";

// ne Build CST from tokens like \if{}{} --> Command(name="if",args=2...)
// ne  Build AST from CST like Command(name="if",args=2...) --> IfStatement(condition=...,trueBranch=...,falseBranch=...)

/**
 * Parse tokens into an Abstract Syntax Tree (AST)
 */
export function parse(input: Token[], isRecursiveCall: boolean = false): ASTNode {
  // Helpers
  function option(expected: TokenType): boolean {
    return peek()?.type === expected;
  }
  function peek(): Token {
    return input[0];
  }
  function multipeek(count: number): Token[] {
    return input.slice(0, count);
  }
  function hasMore(): boolean {
    return input.length > 0;
  }
  function consume(expected: TokenType): Token {
    const token = input.shift();
    if (!token) err("Unexpected end of input");
    if (token.type !== expected) {
      err(`Expected ${expected} got ${token.type}.`, token.row, token.col);
    }
    return token;
  }
  function consumeAny(): Token {
    return input.shift() ?? err("Unexpected end of input");
  }

  function assertFnArgCount(thisToken: Token, count: number, args?: ASTNode[]) {
    assertCount("arguments", `in function \\${thisToken.value}`, thisToken, count, args);
  }
  function assertFnArgRange(thisToken: Token, min: number, max: number, args?: ASTNode[]) {
    assertRange("arguments", `in function \\${thisToken.value}`, thisToken, min, max, args);
  }
  function assertParamCount(thisToken: Token, count: number, params?: Params) {
    assertCount("parameters", `in function \\${thisToken.value}`, thisToken, count, params?.kv ? Object.values(params.kv) : undefined);
  }

  const root: ASTNode[] = [];

  loop: while (input.length > 0) {
    const token = peek();
    switch (token.type) {
      case TokenType.T_RAW:
        root.push(parseRaw());
        break;
      case TokenType.T_EVAL:
        root.push(parseEval());
        break;
      case TokenType.T_PREFIX:
        root.push(parseCommand());
        break;
      default:
        if (isRecursiveCall) break loop; // if recusion {{}} then dont error bc remaining tokens are handled by parent
        err(`Unexpected token ${token.type}`, token.row, token.col);
    }
  }

  function parseRaw(): ASTNode {
    const t = consume(TokenType.T_RAW);
    return new Raw(t.value);
  }

  function parseEval(): ASTNode {
    const t = consume(TokenType.T_EVAL);
    return new EvalExpr(t.value.slice(1, -1));
  }

  function parseParams(): Params {
    const kv: { [key: string]: ASTNode | null } = {};
    consume(TokenType.T_PARAM_START);

    while (!option(TokenType.T_PARAM_END)) {
      const key = consume(TokenType.T_PARAM_KEY);
      let value;
      // allow [arg1,arg2,...]
      if (option(TokenType.T_PARAM_ASSIGN)) {
        consume(TokenType.T_PARAM_ASSIGN);
        value = parse(input, true);
      }
      // [foo=bar]
      kv[key.value] = value ?? null;
      if (!option(TokenType.T_PARAM_SEP)) break;
      consume(TokenType.T_PARAM_SEP);
    }
    consume(TokenType.T_PARAM_END);

    return new Params(kv);
  }

  function parseArguments(alwaysEvalNArgs?: number): ASTNode[] {
    consume(TokenType.T_ARG_START);
    const args: ASTNode[] = [];

    // may break if JS contains { }
    while (alwaysEvalNArgs && alwaysEvalNArgs > 0) {
      alwaysEvalNArgs--;
      let evalCode = "";
      while (!option(TokenType.T_ARG_END)) evalCode += consumeAny().value;
      consume(TokenType.T_ARG_END);
      consume(TokenType.T_ARG_START);
      args.push(new EvalExpr(evalCode));
    }

    while (hasMore()) {
      const arg = parse(input, true);
      args.push(arg);
      consume(TokenType.T_ARG_END);
      if (!option(TokenType.T_ARG_START)) break;
      consume(TokenType.T_ARG_START);
    }

    return args;
  }

  function parseCommand(): ASTNode {
    consume(TokenType.T_PREFIX);
    const cmd = consume(TokenType.T_CMD);
    // before params and args parsing
    switch (cmd.value) {
      case BuiltInFunction.COMMENT:
        // short circuit for comments. dont evaluate anything
        consume(TokenType.T_ARG_START);
        const ignoredTokens = [];
        while (!option(TokenType.T_ARG_END)) ignoredTokens.push(consumeAny());
        consume(TokenType.T_ARG_END);
        return new Comment(ignoredTokens.map((t) => t.value).join(""));
      case BuiltInFunction.EVAL:
        consume(TokenType.T_ARG_START);
        const evalTokens = [];
        while (!option(TokenType.T_ARG_END)) evalTokens.push(consumeAny());
        consume(TokenType.T_ARG_END);
        return new EvalExpr(evalTokens.map((t) => t.value).join(""));
    }

    // handle function with ! -> evaluate 1st argument always as EVAL.
    let treatNArgsAsEval = 0;
    if (cmd.value.endsWith("!")) {
      switch (cmd.value) {
        case BuiltInFunction.LOOP + "!":
          treatNArgsAsEval = 3;
          break;
        case BuiltInFunction.IF + "!":
        case BuiltInFunction.FILE + "!":
        case BuiltInFunction.URL + "!":
        case BuiltInFunction.USE + "!":
          treatNArgsAsEval = 1;
          break;
      }
    }

    const params = option(TokenType.T_PARAM_START) ? parseParams() : undefined;
    const args = option(TokenType.T_ARG_START) ? parseArguments(treatNArgsAsEval) : [];

    // check if built-in function except comment
    switch (cmd.value) {
      case BuiltInFunction.F:
        assertFnArgCount(cmd, 2, args);
        return new FunctionDefinition(args[0], params as Params, args[1]);
      case BuiltInFunction.IF:
      case BuiltInFunction.IF + "!":
        assertFnArgRange(cmd, 2, 3, args);
        assertParamCount(cmd, 0, params);
        return new IfStatement(args[0], args[1], args[2]);
      case BuiltInFunction.LOOP:
      case BuiltInFunction.LOOP + "!":
        assertFnArgCount(cmd, 4, args);
        assertParamCount(cmd, 0, params);
        return new LoopStatement(args[0], args[1], args[2], args[3]);
      case BuiltInFunction.URL:
      case BuiltInFunction.URL + "!":
        assertFnArgCount(cmd, 1, args);
        assertParamCount(cmd, 0, params);
        return new URLStatement(args[0]);
      case BuiltInFunction.FILE:
      case BuiltInFunction.FILE + "!":
        assertFnArgCount(cmd, 1, args);
        assertParamCount(cmd, 0, params);
        return new FileStatement(args[0]);
      case BuiltInFunction.USE:
      case BuiltInFunction.USE + "!":
        assertFnArgCount(cmd, 1, args);
        assertParamCount(cmd, 0, params);
        return new UseStatement(args[0]);
      default:
        // else function call like \foobar[..]{...}...
        console.warn(cmd.value);
        return new FunctionCall(cmd.value, params, args);
    }
  }

  function parseIfCmd(): ASTNode {}

  return new Program(root);
}