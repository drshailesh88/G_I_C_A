import { readFileSync } from "fs";

const base = JSON.parse(readFileSync("stryker.config.json", "utf8"));

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  ignoreStatic: true,
};
