import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ignore from "ignore";

// GitHub Personal Access Token - REPLACE WITH YOUR TOKEN
const TOKEN = "";

// Configuration for the new repository
const REPO_CONFIG = {
  name: "loan-management-system", // Repository name
  description: "Loan management system project", // Optional description
  private: true, // Set to false for a public repository
  auto_init: false, // We'll add files manually
};

// Folder path to upload
const FOLDER_PATH =
  "/home/acer/Downloads/NewAws/loan-management-system3443-2024-11-15-06-37-56/loan-management-system3443";

async function createRepositoryAndUpload() {
  try {
    // 1. Create Repository
    const createRepoResponse = await fetch(
      "https://api.github.com/user/repos",
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify(REPO_CONFIG),
      }
    );

    if (!createRepoResponse.ok) {
      const errorText = await createRepoResponse.text();
      console.error("Failed to create repository:", errorText);
      return;
    }

    const repoData = await createRepoResponse.json();
    const repoFullName = repoData.full_name;
    const [repoOwner, repoName] = repoFullName.split("/");

    console.log(`Repository created: ${repoFullName}`);

    // 2. Create an initial README.md to establish the initial commit
    const initialCommitResponse = await createInitialCommit(repoFullName);
    if (!initialCommitResponse) {
      console.error("Failed to create initial commit");
      return;
    }

    // 3. Prepare files for upload
    const files = gatherFiles(FOLDER_PATH);
    console.log(`Preparing to upload ${files.length} files`);

    // 4. Create blobs for each file with improved error handling
    const blobs = [];
    for (const file of files) {
      try {
        // Attempt to read file with different encodings
        let fileContent;
        const encodings = ["utf8", "latin1", "base64"];

        for (const encoding of encodings) {
          try {
            fileContent = fs.readFileSync(
              path.join(FOLDER_PATH, file.path),
              encoding
            );
            break;
          } catch (readError) {
            console.log(`Failed to read with ${encoding} encoding`);
          }
        }

        if (!fileContent) {
          console.error(`Could not read file: ${file.path}`);
          continue;
        }

        // Limit file size (GitHub has a 100MB limit per file)
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
        if (Buffer.byteLength(fileContent) > MAX_FILE_SIZE) {
          console.warn(`File ${file.path} exceeds 100MB. Skipping.`);
          continue;
        }

        // Create blob
        const blobResponse = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/blobs`,
          {
            method: "POST",
            headers: {
              Authorization: `token ${TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: Buffer.from(fileContent).toString("base64"),
              encoding: "base64",
            }),
          }
        );

        if (!blobResponse.ok) {
          const errorText = await blobResponse.text();
          console.error(`Failed to create blob for ${file.path}:`, errorText);
          continue;
        }

        const blobData = await blobResponse.json();
        blobs.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        });

        console.log(`Successfully processed: ${file.path}`);
      } catch (fileError) {
        console.error(`Error processing file ${file.path}:`, fileError);
      }
    }

    console.log(
      `Successfully processed ${blobs.length} out of ${files.length} files`
    );

    // 5. Create a tree
    const treeResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tree: blobs,
        }),
      }
    );

    if (!treeResponse.ok) {
      const errorText = await treeResponse.text();
      console.error("Failed to create tree:", errorText);
      return;
    }

    const treeData = await treeResponse.json();

    // 6. Create a commit
    const commitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Initial commit - Loan Management System",
          tree: treeData.sha,
          parents: [initialCommitResponse.sha],
        }),
      }
    );

    if (!commitResponse.ok) {
      const errorText = await commitResponse.text();
      console.error("Failed to create commit:", errorText);
      return;
    }

    const commitData = await commitResponse.json();

    // 7. Update repository reference
    const refUpdateResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/main`,
      {
        method: "PATCH",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sha: commitData.sha,
        }),
      }
    );

    if (!refUpdateResponse.ok) {
      const errorText = await refUpdateResponse.text();
      console.error("Failed to update branch reference:", errorText);
      return;
    }

    console.log(
      `Successfully created repository and uploaded ${blobs.length} files to ${repoFullName}`
    );
  } catch (error) {
    console.error("Error in repository creation and upload:", error);
  }
}

// Function to create initial commit with README
async function createInitialCommit(repoFullName) {
  try {
    // 1. Create README blob
    const readmeBlobResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/blobs`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: Buffer.from(
            "# Loan Management System\n\nProject initialized."
          ).toString("base64"),
          encoding: "base64",
        }),
      }
    );

    if (!readmeBlobResponse.ok) {
      console.error("Failed to create README blob");
      return null;
    }

    const readmeBlobData = await readmeBlobResponse.json();

    // 2. Create tree with README
    const treeResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tree: [
            {
              path: "README.md",
              mode: "100644",
              type: "blob",
              sha: readmeBlobData.sha,
            },
          ],
        }),
      }
    );

    if (!treeResponse.ok) {
      console.error("Failed to create initial tree");
      return null;
    }

    const treeData = await treeResponse.json();

    // 3. Create initial commit
    const commitResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Initial commit - Repository setup",
          tree: treeData.sha,
          parents: [],
        }),
      }
    );

    if (!commitResponse.ok) {
      console.error("Failed to create initial commit");
      return null;
    }

    const commitData = await commitResponse.json();

    // 4. Create main branch reference
    const refResponse = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "refs/heads/main",
          sha: commitData.sha,
        }),
      }
    );

    if (!refResponse.ok) {
      console.error("Failed to create branch reference");
      return null;
    }

    return commitData;
  } catch (error) {
    console.error("Error in creating initial commit:", error);
    return null;
  }
}

// File gathering function
function gatherFiles(dirPath, basePath = "") {
  const files = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const relativePath = path.join(basePath, item);

    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...gatherFiles(fullPath, relativePath));
    } else {
      files.push({
        path: relativePath,
      });
    }
  }
  return files;
}

// Run the script
createRepositoryAndUpload();
