// @ts-nocheck
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface PackageTarget {
	name: string;
	dir: string;
	bump?: boolean;
}

const packageTargets: PackageTarget[] = [
	{ name: "codex-1up", dir: "cli", bump: true },
];

function run(command: string, cwd: string) {
	console.log(`Executing: ${command} in ${cwd}`);
	execSync(command, { stdio: "inherit", cwd });
}

function ensureCleanWorkingTree() {
	const status = execSync("git status --porcelain", { cwd: "." })
		.toString()
		.trim();
	if (status.length > 0) {
		throw new Error(
			"Working tree has uncommitted changes. Please commit or stash them before running the release script.",
		);
	}
}

/**
 * Bump version in package.json
 * @param pkgPath Path to the package directory
 * @param type Version bump type: 'major', 'minor', 'patch', or specific version
 * @returns The new version
 */
function bumpVersion(
	pkgPath: string,
	type: "major" | "minor" | "patch" | string,
): string {
	const pkgJsonPath = path.join(pkgPath, "package.json");
	const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
	const currentVersion = pkgJson.version;
	let newVersion: string;

	if (type === "major" || type === "minor" || type === "patch") {
		// Parse current version
		const [major, minor, patch] = currentVersion.split(".").map(Number);

		// Bump version according to type
		if (type === "major") {
			newVersion = `${major + 1}.0.0`;
		} else if (type === "minor") {
			newVersion = `${major}.${minor + 1}.0`;
		} else {
			// patch
			newVersion = `${major}.${minor}.${patch + 1}`;
		}
	} else {
		// Use the provided version string directly
		newVersion = type;
	}

	// Update package.json
	pkgJson.version = newVersion;
	fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

	console.log(
		`Bumped version from ${currentVersion} to ${newVersion} in ${pkgJsonPath}`,
	);
	return newVersion;
}

/**
 * Bump version in all package.json files
 * @param versionBump Version bump type or specific version
 * @returns The new version
 */
function bumpAllVersions(
	versionBump: "major" | "minor" | "patch" | string = "patch",
): string {
	const target = packageTargets[0];
	const pkgPath = path.resolve(target.dir);
	return bumpVersion(pkgPath, versionBump);
}

/**
 * Create a git commit and tag for the release
 * @param version The version to tag
 */
function createGitCommitAndTag(version: string) {
	console.log("Creating git commit and tag...");

	try {
		// Stage all changes
		run("git add .", ".");

		// Create commit with version message
		run(`git commit -m "chore: release v${version}"`, ".");

		// Create tag
		run(`git tag -a v${version} -m "Release v${version}"`, ".");

		// Push commit and tag to remote
		console.log("Pushing commit and tag to remote...");
		run("git push", ".");
		run("git push --tags", ".");

		console.log(`Successfully created and pushed git tag v${version}`);
	} catch (error) {
		console.error("Failed to create git commit and tag:", error);
		throw error;
	}
}

async function releasePackages(
	versionBump: "major" | "minor" | "patch" | string = "patch",
) {
	ensureCleanWorkingTree();

	const newVersion = bumpAllVersions(versionBump);
	run("pnpm -C cli build", ".");
	console.log("Release tag created; npm publish will run via GitHub Actions (Trusted Publishing).");

	createGitCommitAndTag(newVersion);

	// After tagging, create or update a GitHub Release with notes from CHANGELOG
	try {
		createGithubRelease(newVersion);
	} catch (e) {
		console.warn("Skipping GitHub Release creation:", e);
	}
}

// Get version bump type from command line arguments
const args = process.argv.slice(2);
const versionBumpArg = args[0] || "patch"; // Default to patch

releasePackages(versionBumpArg).catch(console.error);

// -------------- helpers: GitHub Release --------------

function hasGhCLI(): boolean {
	try {
		execSync("gh --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function changelogSection(versionLike: string): string | null {
	const file = path.resolve("CHANGELOG.md");
	if (!fs.existsSync(file)) return null;
	const text = fs.readFileSync(file, "utf8");
	const re = new RegExp(
		`^## \\\\[${versionLike.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\\\]` + "[\\s\\S]*?(?=^## \\\\[(?:.|\\n)*?\\\\]|\n\n?$)",
		"m",
	);
	const m = text.match(re);
	return m ? m[0].trim() + "\n" : null;
}

function ghReleaseExists(tag: string): boolean {
	try {
		execSync(`gh release view ${tag}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function createGithubRelease(version: string) {
	if (!hasGhCLI()) return;
	const tag = `v${version}`;
	const title = `codex-1up ${tag}`;
	let notes = changelogSection(version);

	// fallback: if no section for this semver (e.g., 0.1.1), try mapping to 0.4 if present
	if (!notes) {
		const alt = process.env.GH_NOTES_REF || "0.4";
		notes = changelogSection(alt) || undefined;
	}

	const tmp = path.join(os.tmpdir(), `release-notes-${version}.md`);
	if (notes) fs.writeFileSync(tmp, notes);

	const exists = ghReleaseExists(tag);
	const cmd = exists
		? `gh release edit ${tag} --title "${title}" ${notes ? `--notes-file ${tmp}` : "--generate-notes"}`
		: `gh release create ${tag} --title "${title}" ${notes ? `--notes-file ${tmp}` : "--generate-notes"}`;

	console.log(`${exists ? "Updating" : "Creating"} GitHub Release ${tag}...`);
	execSync(cmd, { stdio: "inherit" });
}
