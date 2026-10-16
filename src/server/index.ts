#!/usr/bin/env node
import { effectivePiStudioConfig, maxUploadBytes } from "../config.js";
import { buildApp } from "./app.js";

const { config } = effectivePiStudioConfig();
const app = await buildApp({ bodyLimit: maxUploadBytes(process.env, config) });
await app.listen({ port: config.port ?? 8504, host: config.host ?? "127.0.0.1" });
