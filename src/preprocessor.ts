import { DefaultConfig, Config, err, info, warn } from "./common";

// 1. add default stuff (meta config)

const metaConfigRegex = /\\\\\\utpp\[([\s\S]*?)\]/g;

export function preprocess(input: string): [string, Readonly<Config>] {
  // scan code for meta config
  const configs = input.matchAll(metaConfigRegex);
  let metaConfig: Config = DefaultConfig;
  let errors: string[] = [];
  let len = 0;

  for (const match of configs) {
    const [_, config] = match;
    const options = config.split(",").map((x) => x.trimStart());
    const kv = options.map((x) => x.split("=")).filter((k, v) => k !== undefined && k[0] !== "");
    for (const [key, value] of kv) {
      if (value === undefined) {
        err(`Invalid meta config key-value pair (${key},${value}). ${key === undefined ? "key" : "value"} cannot be undefined.`);
      }

      if (!Object.hasOwn(metaConfig, key)) {
        // error or warn ?
        // errors.push(`Unknown meta config key '${key}'.`);
        info(`Unknown meta config key '${key}' defined.`);
      }

      metaConfig[key as keyof Config] = value;
      len++;
    }
  }

  if (len > 1) {
    warn("Multiple meta config blocks found.");
  }

  if (errors.length > 0) {
    err(errors.join("\n"));
  }

  input = input.replaceAll(metaConfigRegex, "");
  console.log("input", input);

  return [input, metaConfig];
}
