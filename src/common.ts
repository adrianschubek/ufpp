import chalk from "chalk";
import { Params } from "./ast";

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
  _USE = "_USE" /* imports. nein: must be top level. parse file then interpret */,
  _MATCH = "_MATCH",
  _CASE = "_CASE",
}

// built in cannot be overriden
export enum BuiltInFunction {
  LOOP = "loop",
  IF = "if",
  EVAL = "$",
  ENV = "env",
  F = "f" /* function definition */,
  RPL = "rpl" /* replace function */,
  RN = "rn" /* rename function */,
  DEL = "del" /* remove function */,
  TOPARENT = "toparent" /* copy toparent function */,
  TOCHILD = "tochild" /* copy tochild function */,
  COMMENT = "#",
  URL = "url",
  FILE = "file",
  USE = "use",
  VAR = "var",
  TRUE = "true",
  FALSE = "false",
  HALT = "halt" /* stop exec immediate */,
  ASSERT = "assert" /* assert function */,
  MATCH = "match",
  CASE = "case",
}

// export interface Config {
//   /* Tokens */
//   prefix: string;
//   argStart: string;
//   argEnd: string;
//   paramStart: string;
//   paramAssign: string;
//   paramSep: string;
//   paramEnd: string;
//   evalStart: string;
//   evalEnd: string;
//   /* Visitor */
//   readUrls: boolean;
//   readFiles: boolean;
//   readEnv: boolean;
//   eval: boolean;
// }

export type Config = { [key in ConfigKey]: string };

export type ConfigKey =
  /* Lexer */
  | "prefix"
  | "argStart"
  | "argEnd"
  | "paramStart"
  | "paramAssign"
  | "paramSep"
  | "paramEnd"
  | "evalStart"
  | "evalEnd"
  /* Visitor */
  | "readUrls"
  | "readFiles"
  | "readEnv"
  | "eval";
// | "allowBuiltinOverride";
// | string /* custom config key */;

export const DefaultConfig: Config = {
  /* Tokens */
  prefix: "\\",
  argStart: "{",
  argEnd: "}",
  paramStart: "[",
  paramAssign: "=",
  paramSep: ",",
  paramEnd: "]",
  evalStart: "`",
  evalEnd: "`",
  /* Visitor */
  readUrls: "true",
  readFiles: "true",
  readEnv: "true",
  eval: "true",
  // allowBuiltinOverride: "false",
};

export interface Token extends Indexable {
  type: TokenType;
  value: string;
  row: number;
  col: number;
}

export interface Indexable {
  row: number;
  col: number;
}

/**
 * Check RAW for truthy values
 *
 */
export function truthy(value: string): boolean {
  const val = value.toLowerCase().trim();
  return /* val !== "false" && val !== "0" &&  */ val !== "$false";
}

export function info(msg: string, row?: number, col?: number): void {
  // can be silenced with "-q"
  console.log("ℹ️ " + chalk.cyanBright(` ${msg} ${row !== undefined && col !== undefined ? `on line ${row}:${col}.` : ""}`));
}

export function warn(msg: string, row?: number, col?: number): void {
  // treat warning as errors config?
  console.log("⚠️ " + chalk.yellow(` ${msg} ${row !== undefined && col !== undefined ? `on line ${row}:${col}.` : ""}`));
}

export function err(msg: string, row?: number, col?: number): never {
  throw new Error("🔥 " + chalk.red(`${msg} ${row !== undefined && col !== undefined ? `on line ${row}:${col}.` : ""}`));
}

export function assertCount<T>(text: string, details: string, thisToken: Indexable, count: number, args?: T[]) {
  let actual = args?.length ?? 0;
  if (actual !== count) {
    err(
      `Expected ${chalk.redBright(count)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col
    );
  }
}
export function assertRange<T>(text: string, details: string, thisToken: Indexable, min: number, max: number, args?: T[]) {
  let actual = args?.length ?? 0;
  if (actual < min || actual > max) {
    err(
      `Expected ${chalk.redBright(min)} to ${chalk.redBright(max)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col
    );
  }
}

export function assertFnArgCount<T>(thisToken: Indexable, fnName: string, count: number, args?: T[]) {
  assertCount("arguments", `in function \\${fnName}`, thisToken, count, args);
}
export function assertFnArgRange<T>(thisToken: Indexable, fnName: string, min: number, max: number, args?: T[]) {
  assertRange("arguments", `in function \\${fnName}`, thisToken, min, max, args);
}
export function assertParamCount(thisToken: Indexable, fnName: string, count: number, params: Params | null) {
  assertCount("parameters", `in function \\${fnName}`, thisToken, count, params?.kv ? Object.values(params.kv) : undefined);
}
export function assertParamRange(thisToken: Indexable, fnName: string, min: number, max: number, params: Params | null) {
  assertRange("parameters", `in function \\${fnName}`, thisToken, min, max, params?.kv ? Object.values(params.kv) : undefined);
}

export function assertType<T>(details: string, thisToken: Indexable, expected: T, actual: T) {
  if (actual !== expected) {
    err(`Expected ${chalk.redBright(expected)} but got ${chalk.redBright(actual)} ${details}`, thisToken.row, thisToken.col);
  }
}
