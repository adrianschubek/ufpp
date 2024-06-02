import chalk from "chalk";
import { ASTNode, Params } from "./ast";

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
  _USE = "_USE" /* imports. ast mergen. analyzer. nein: must be top level. parse file then interpret */,
  _COMPILE = "_COMPILE" /* wie \file nur mit pieplien komplett interpret -> string. \compile{\file{other.utpp}} */,
  _MATCH = "_MATCH",
  _CASE = "_CASE",
  _EXEC = "_EXEC",
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
  COMPILE = "compile",
  MATCH = "match",
  CASE = "case",
  EXEC = "exec",
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
  | "fileName"
  | "filePath"
  | "fileEncoding"
  | "version"
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
  | "net" /* read.. */
  | "files"
  | "env"
  | "eval"
  | "imports" /* use */
  | "exec"; /* shell commands */
// | "allowBuiltinOverride";
// | string /* custom config key */;

export const DefaultConfig: Config = {
  fileName: "",
  filePath: "",
  fileEncoding: "utf8",
  version: "1",
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
  net: "true",
  files: "true",
  env: "true",
  eval: "true",
  imports: "true",
  exec: "false",
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

export function rowcol(token: ASTNode): [number, number] {
  return [token.row, token.col];
}

/**
 * Check RAW for truthy values
 *
 */
export function truthy(value: string): boolean {
  const val = value.toLowerCase().trim();
  return /* val !== "false" && val !== "0" &&  */ val !== "$false";
}

function msgTemplate(msg: string, row?: number, col?: number, config?: Config): string {
  const msgFileName = config?.fileName !== undefined ? `in ${config.fileName}` : "";
  const msgRowCol = row !== undefined && col !== undefined ? `on line ${row}:${col}` : "";
  return `${msg} ${msgRowCol} ${msgFileName}`;
}

export function info(msg: string, row?: number, col?: number, config?: Config): void {
  // can be silenced with "-q"
  console.log("ℹ️ " + chalk.gray(msgTemplate(msg, row, col, config)));
}

export function warn(msg: string, row?: number, col?: number, config?: Config): void {
  console.log("⚠️ " + chalk.yellow(msgTemplate(msg, row, col, config)));
}

export function err(msg: string, row?: number, col?: number, config?: Config): never {
  throw new Error("🔥 " + chalk.red(msgTemplate(msg, row, col, config)));
}

export function assertCount<T>(text: string, details: string, thisToken: Indexable, count: number, args?: T[], config?: Config) {
  let actual = args?.length ?? 0;
  if (actual !== count) {
    err(
      `Expected ${chalk.redBright(count)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col,
      config
    );
  }
}
export function assertRange<T>(text: string, details: string, thisToken: Indexable, min: number, max: number, args?: T[], config?: Config) {
  let actual = args?.length ?? 0;
  if (actual < min || actual > max) {
    err(
      `Expected ${chalk.redBright(min)} to ${chalk.redBright(max)} ${text} but got ${chalk.redBright(actual === 0 ? "none" : actual)} ${details}`,
      thisToken.row,
      thisToken.col,
      config
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
