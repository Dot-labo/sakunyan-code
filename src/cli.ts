#!/usr/bin/env node

import { main } from "@earendil-works/pi-coding-agent";

process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";

await main(process.argv.slice(2));
