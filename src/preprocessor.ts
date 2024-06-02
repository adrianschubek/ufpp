import { Config, err as trueErr, info as trueInfo } from "./common";

// 1. add default stuff (meta config)

const metaConfigRegex = /\\\\\\utpp\[([\s\S]*?)\]/g;

export function preprocess(
  input: string,
  initConf: Config,
  forceInitConf?: boolean /* \use[eval=false] has higher priority over meta config block inside file */
): [string, Readonly<Config>] {
  // scan code for meta config
  const configs = input.matchAll(metaConfigRegex);
  let metaConfig: Config = initConf;
  let errors: string[] = [];
  let len = 0;

  const err = (msg: string) => trueErr(msg, undefined, undefined, metaConfig);
  const info = (msg: string) => trueInfo(msg, undefined, undefined, metaConfig);

  for (const match of configs) {
    const [_, config] = match;
    const options = config.split(",").map((x) => x.trimStart());
    const kv = options.map((x) => x.split("=")).filter((k, v) => k !== undefined && k[0] !== "");
    for (const [key, value] of kv) {
      if (value === undefined) {
        err(`Invalid meta config key-value pair (${key},${value}). ${key === undefined ? "key" : "value"} cannot be undefined`);
      }

      if (!Object.hasOwn(metaConfig, key)) {
        // error or warn ?
        // errors.push(`Unknown meta config key '${key}'.`);
        info(`Unknown meta config key '${key}' defined`);
      }

      metaConfig[key as keyof Config] = value;
    }
    len++;
  }

  if (len > 1) {
    info("Multiple meta config blocks found");
  }

  if (errors.length > 0) {
    err(errors.join("\n"));
  }

  if (forceInitConf) {
    // (initconf) \use[eval=false] has higher priority over meta config block inside file (metaconfig)
    metaConfig = { ...metaConfig, ...initConf };
  }

  input = input.replaceAll(metaConfigRegex, "");
  console.log("input", input);

  return [input, metaConfig];
}
