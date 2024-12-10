import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ignore from "ignore";

const GITHUB_API_URL = "https://api.github.com";
const TOKEN = "";
const REPO_OWNER = "abhijeet4rana";
const REPO_NAME = "LMS";
const BRANCH = "main";

async function uploadWithSingleCommit(folderPath) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  // Fetch the latest commit SHA for the main branch
  let latestCommitSha;
  try {
    const refResponse = await fetch(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`,
      { headers }
    );

    if (!refResponse.ok) {
      console.error("Failed to fetch branch reference");
      console.error("Response:", await refResponse.text());
      return;
    }

    const refData = await refResponse.json();
    latestCommitSha = refData.object.sha;
    console.log("Latest commit SHA:", latestCommitSha);
  } catch (error) {
    console.error("Error fetching latest commit:", error);
    return;
  }

  // Parse .gitignore
  let ig;
  try {
    const gitignorePath = path.join(folderPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      ig = ignore().add(gitignoreContent);
    } else {
      ig = ignore();
    }
  } catch (error) {
    console.error("Error reading .gitignore:", error);
    ig = ignore();
  }

  // Recursive file gathering function
  function gatherFiles(dirPath, basePath = "") {
    const files = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const relativePath = path.join(basePath, item);

      // Skip ignored files
      if (ig.ignores(relativePath)) continue;

      if (fs.statSync(fullPath).isDirectory()) {
        files.push(...gatherFiles(fullPath, relativePath));
      } else {
        files.push({
          path: relativePath,
          content: fs.readFileSync(fullPath, "utf-8"),
        });
      }
    }
    return files;
  }

  // Gather all files
  const filesToUpload = gatherFiles(folderPath);
  console.log(`Preparing to upload ${filesToUpload.length} files`);

  // Create blobs for each file
  const blobPromises = filesToUpload.map(async (file) => {
    const blobResponse = await fetch(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        }),
      }
    );

    if (!blobResponse.ok) {
      console.error(`Failed to create blob for ${file.path}`);
      console.error("Response:", await blobResponse.text());
      return null;
    }

    const blobData = await blobResponse.json();
    return {
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobData.sha,
    };
  });

  // Wait for all blobs to be created
  const treeEntries = (await Promise.all(blobPromises)).filter(
    (entry) => entry !== null
  );

  // Fetch the base tree of the latest commit
  let baseTreeSha;
  try {
    const commitResponse = await fetch(
      `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${latestCommitSha}`,
      { headers }
    );

    if (!commitResponse.ok) {
      console.error("Failed to fetch commit details");
      console.error("Response:", await commitResponse.text());
      return;
    }

    const commitData = await commitResponse.json();
    baseTreeSha = commitData.tree.sha;
  } catch (error) {
    console.error("Error fetching base tree:", error);
    return;
  }

  // Create a new tree
  const treeResponse = await fetch(
    `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    }
  );

  if (!treeResponse.ok) {
    console.error("Failed to create tree");
    console.error("Response:", await treeResponse.text());
    return;
  }

  const treeData = await treeResponse.json();

  // Create a commit
  const commitResponse = await fetch(
    `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `Testing Commit from ${path.basename(folderPath)}`,
        tree: treeData.sha,
        parents: [latestCommitSha],
      }),
    }
  );

  if (!commitResponse.ok) {
    console.error("Failed to create commit");
    console.error("Response:", await commitResponse.text());
    return;
  }

  const commitData = await commitResponse.json();

  // Update branch reference
  const refUpdateResponse = await fetch(
    `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        sha: commitData.sha,
      }),
    }
  );

  if (!refUpdateResponse.ok) {
    console.error("Failed to update branch reference");
    console.error("Response:", await refUpdateResponse.text());
    return;
  }

  console.log("Successfully uploaded all files in a single commit!");
}

// Specify the folder path to upload
const folderPath =
  "/home/acer/Downloads/NewAws/loan-management-system3443-2024-11-15-06-37-56/loan-management-system3443";
uploadWithSingleCommit(folderPath);
