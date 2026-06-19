#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const command = process.argv[2];

if (!command) {
  console.error("codex_stdio_bridge: missing command argument");
  process.exit(64);
}

function shellWords(input) {
  const words = [];
  let word = "";
  let quote = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      word += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        word += char;
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (word) {
        words.push(word);
        word = "";
      }

      continue;
    }

    word += char;
  }

  if (escaping) {
    word += "\\";
  }

  if (quote) {
    throw new Error("unterminated quote");
  }

  if (word) {
    words.push(word);
  }

  return words;
}

function commandSpec(input) {
  const words = shellWords(input);
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (key.startsWith("MIX_") || key.startsWith("ERL_") || key.startsWith("ELIXIR_")) {
      delete env[key];
    }
  }

  while (words.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    const assignment = words.shift();
    const equalsIndex = assignment.indexOf("=");
    env[assignment.slice(0, equalsIndex)] = assignment.slice(equalsIndex + 1);
  }

  const executable = words.shift();

  if (!executable) {
    throw new Error("empty command");
  }

  const bundledCodex = "/Applications/Codex.app/Contents/Resources/codex";
  const resolvedExecutable =
    executable === "codex" && fs.existsSync(bundledCodex) ? bundledCodex : executable;

  return { executable: resolvedExecutable, args: words, env };
}

let spec;

try {
  spec = commandSpec(command);
} catch (error) {
  console.error(`codex_stdio_bridge: ${error.message}`);
  process.exit(64);
}

const fifoPath = path.join(os.tmpdir(), `symphony-codex-stdin-${process.pid}.fifo`);
let fifoFd = null;
let child = null;
let started = false;

function cleanup() {
  if (fifoFd !== null) {
    try {
      fs.closeSync(fifoFd);
    } catch {
      // Best effort during shutdown.
    }
  }

  try {
    fs.unlinkSync(fifoPath);
  } catch {
    // Best effort during shutdown.
  }
}

function startChild(firstChunk) {
  try {
    try {
      fs.unlinkSync(fifoPath);
    } catch {
      // The path normally does not exist.
    }

    execFileSync("/usr/bin/mkfifo", [fifoPath]);
    fifoFd = fs.openSync(fifoPath, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
    fs.writeSync(fifoFd, firstChunk);

    child = spawn(spec.executable, spec.args, {
      cwd: process.cwd(),
      env: spec.env,
      stdio: [fifoFd, "pipe", "pipe"],
    });
  } catch (error) {
    cleanup();
    console.error(`codex_stdio_bridge: ${error.message}`);
    process.exit(1);
  }

  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stdout);

  child.on("error", (error) => {
    cleanup();
    console.error(`codex_stdio_bridge: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    cleanup();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

process.stdin.on("data", (chunk) => {
  if (!started) {
    started = true;
    startChild(chunk);
    return;
  }

  fs.writeSync(fifoFd, chunk);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (child) {
      child.kill(signal);
    }
  });
}

process.stdin.on("end", () => {
  if (!started) {
    cleanup();
    process.exit(0);
  }
});
