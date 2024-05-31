import chalk from "chalk";

export enum TokenType {
  T_RAW = "T_RAW",
  T_PREFIX = "T_PREFIX",
  T_CMD = "T_CMD",
  T_ARG = "T_ARG",
  T_ARG_START = "T_ARG_START",
  T_ARG_END = "T_ARG_END",

  T_PARAM_START = "T_PARAM_START",
  T_PARAM_END = "T_PARAM_END",
  T_PARAM_SEP = "T_PARAM_SEP",
  T_PARAM_ASSIGN = "T_PARAM_ASSIGN",
  T_PARAM_KEY = "T_PARAM_KEY",
  T_EVAL = "T_EVAL",
}

export enum ASTNodeType {
  PROG = "PROG",
  RAW = "RAW",
  F_CALL = "F_CALL" /* custom function call */,
  F_DEF = "F_DEF" /* custom function definition */,
  PARAMS = "PARAMS",
  _IF = "_IF" /* built-in function if */,
  COMMENT = "COMMENT",
  EVAL = "EVAL",
  _LOOP = "_LOOP",
  _URL = "_URL",
  _FILE = "_FILE",
  _USE = "_USE" /* imports. must be top level. parse file then interpret */,
}

export enum BuiltInFunction {
  LOOP = "loop",
  IF = "if",
  EVAL = "$",
  ENV = "env",
  F = "f" /* fucntion definition */,
  COMMENT = "#",
  URL = "url",
  FILE = "file",
  USE = "use",
}

export interface Token {
  type: TokenType;
  value: string;
  row: number;
  col: number;
}

export function err(msg: string, row?: number, col?: number): never {
  if (row === undefined || col === undefined) throw new Error(msg);
  throw new Error(chalk.red(`${msg} on line ${row}:${col}.`));
}

export function assertCount<T>(text: string, details: string, thisToken: Token, count: number, args?: T[]) {
  let actual = args?.length ?? 0;
  if (actual !== count) {
    err(
      `Expected ${chalk.redBright(count)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col
    );
  }
}
export function assertRange<T>(text: string, details: string, thisToken: Token, min: number, max: number, args?: T[]) {
  let actual = args?.length ?? 0;
  if (actual < min || actual > max) {
    err(
      `Expected ${chalk.redBright(min)} to ${chalk.redBright(max)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col
    );
  }
}

export function assertType<T>(details: string, thisToken: Token, expected: T, actual: T) {
  if (actual !== expected) {
    err(`Expected ${chalk.redBright(expected)} but got ${chalk.redBright(actual)} ${details}`, thisToken.row, thisToken.col);
  }
}
