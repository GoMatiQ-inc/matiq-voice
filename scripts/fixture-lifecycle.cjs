const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
function listeners() {
  if (process.platform === "win32") {
    return execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" })
      .split(/\r?\n/)
      .flatMap((line) => {
        const parts = line.trim().split(/\s+/);
        return parts[0] === "TCP" && parts[3] === "LISTENING"
          ? [{ pid: Number(parts[4]), port: Number(parts[1].split(":").pop()) }]
          : [];
      });
  }
  if (process.platform === "darwin") {
    let text;
    try {
      text = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], {
        encoding: "utf8",
      });
    } catch (error) {
      if (error.status === 1 && !error.stdout?.length) return [];
      throw error;
    }
    let pid;
    const result = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n"))
        result.push({ pid, port: Number(line.split(":").pop()) });
    }
    return result;
  }
  return execFileSync("ss", ["-H", "-ltnp"], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const match = /pid=(\d+),/.exec(line);
      return match
        ? [
            {
              pid: Number(match[1]),
              port: Number(line.trim().split(/\s+/)[3].split(":").pop()),
            },
          ]
        : [];
    });
}
function capture(child) {
  return {
    pid: child.pid,
    ports: listeners()
      .filter((row) => row.pid === child.pid)
      .map((row) => row.port),
  };
}
async function verifyStopped(owned) {
  if (!owned) return;
  let alive = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      process.kill(owned.pid, 0);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      alive = false;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(
    alive,
    false,
    "Owned desktop process is still alive; inspect it before continuing.",
  );
  const remaining = listeners().filter(
    (row) => row.pid === owned.pid || owned.ports.includes(row.port),
  );
  assert.equal(
    remaining.length,
    0,
    "A captured fixture listener remains occupied; inspect ownership, never stop unrelated processes.",
  );
  console.log(
    `PASS: owned desktop process exited and ${owned.ports.length} captured listeners are absent.`,
  );
}
module.exports = { capture, verifyStopped };
