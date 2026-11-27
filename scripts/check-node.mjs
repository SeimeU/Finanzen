// Exits with 1 and a German message when Node.js is older than the build tools need.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Node.js ${process.versions.node} ist zu alt. Bitte Node.js 22.12 oder neuer installieren (https://nodejs.org),`);
  console.error(`danach den Ordner node_modules loeschen und start.bat erneut starten.`);
  process.exit(1);
}
