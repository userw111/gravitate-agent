/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adBriefings from "../adBriefings.js";
import type * as clients from "../clients.js";
import type * as cronJobs from "../cronJobs.js";
import type * as database from "../database.js";
import type * as fireflies from "../fireflies.js";
import type * as firefliesActions from "../firefliesActions.js";
import type * as googleDrive from "../googleDrive.js";
import type * as openrouter from "../openrouter.js";
import type * as organizations from "../organizations.js";
import type * as scriptGeneration from "../scriptGeneration.js";
import type * as scriptSettings from "../scriptSettings.js";
import type * as scripts from "../scripts.js";
import type * as systemPrompts from "../systemPrompts.js";
import type * as typeform from "../typeform.js";
import type * as typeformActions from "../typeformActions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  adBriefings: typeof adBriefings;
  clients: typeof clients;
  cronJobs: typeof cronJobs;
  database: typeof database;
  fireflies: typeof fireflies;
  firefliesActions: typeof firefliesActions;
  googleDrive: typeof googleDrive;
  openrouter: typeof openrouter;
  organizations: typeof organizations;
  scriptGeneration: typeof scriptGeneration;
  scriptSettings: typeof scriptSettings;
  scripts: typeof scripts;
  systemPrompts: typeof systemPrompts;
  typeform: typeof typeform;
  typeformActions: typeof typeformActions;
  users: typeof users;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
