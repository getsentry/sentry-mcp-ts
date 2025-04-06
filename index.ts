#!/usr/bin/env ts-node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import {
  SentryProject,
  ShortIdResolutionResponse,
  EventDetailsResponse,
  SentryProjectCreationResponse,
  SentryClientKey,
  SentryErrorEvent,
  SentryProjectIssue,
  SentryIssueDetailsResponse,
  SentryReplay,
  SentrySetupResponse,
} from "./types";

const SENTRY_AUTH = process.env.SENTRY_AUTH;
const SENTRY_BASE_URL = process.env.SENTRY_BASE_URL || "https://sentry.io";
if (!SENTRY_AUTH) {
  console.error("Error: SENTRY_AUTH environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "Sentry",
  version: "1.0.0",
});

server.tool(
  "list_projects",
  "List accessible Sentry projects. View project slugs, IDs, status, settings, features, and organization details.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization to list projects from"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    view,
    format,
  }: {
    organization_slug: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {

    try {
      // Add breadcrumb for API call      
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/organizations/${organization_slug}/projects/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch projects: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const projects: SentryProject[] = await response.json();
      console.error(
        "DEBUG: Fetched projects:",
        JSON.stringify(projects, null, 2)
      );

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown table
          output = "# Sentry Projects\n\n";
          output +=
            "| ID | Name | Slug | Platform | Teams | Environments | Features |\n";
          output +=
            "|----|------|------|----------|-------|--------------|----------|\n";

          for (const project of projects) {
            const teams: string = project.teams
              .map((team) => team.name)
              .join(", ");
            const environments: string =
              project.environments?.join(", ") || "None";
            const features: string = project.features?.join(", ") || "None";

            output += `| ${project.id} | ${project.name} | ${project.slug} | ${
              project.platform || "N/A"
            } | ${teams} | ${environments} | ${features} |\n`;
          }

          // Add summary information
          output += `\n## Summary\n\n`;
          output += `Total Projects: ${projects.length}\n`;
        } else {
          // Create a summary markdown list
          output = "# Sentry Projects\n\n";

          for (const project of projects) {
            output += `- **${project.name}** (${project.slug}): ID ${project.id}\n`;
          }

          output += `\nTotal Projects: ${projects.length}`;
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = "Sentry Projects:\n\n";

          for (const project of projects) {
            output += `ID: ${project.id}\n`;
            output += `Name: ${project.name}\n`;
            output += `Slug: ${project.slug}\n`;
            output += `Platform: ${project.platform || "N/A"}\n`;
            output += `Teams: ${project.teams
              .map((team) => team.name)
              .join(", ")}\n`;
            output += `Environments: ${
              project.environments?.join(", ") || "None"
            }\n`;
            output += `Features: ${project.features?.join(", ") || "None"}\n\n`;
          }

          output += `Total Projects: ${projects.length}`;
        } else {
          output = "Sentry Projects:\n\n";

          for (const project of projects) {
            output += `${project.name} (${project.slug}): ID ${project.id}\n`;
          }

          output += `\nTotal Projects: ${projects.length}`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching projects: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "resolve_short_id",
  "Retrieve details about an issue using its short ID. Maps short IDs to issue details, project context, and status.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization the issue belongs to"),
    short_id: z
      .string()
      .describe("The short ID of the issue to resolve (e.g., PROJECT-123)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    short_id,
    format,
  }: {
    organization_slug: string;
    short_id: string;
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Resolving short ID:", short_id);
      console.error("DEBUG: For organization:", organization_slug);
      console.error("DEBUG: Format:", format);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/organizations/${organization_slug}/shortids/${short_id}/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to resolve short ID: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const data: ShortIdResolutionResponse = await response.json();
      console.error(
        "DEBUG: Resolved short ID data:",
        JSON.stringify(data, null, 2)
      );

      // Format the output based on the format
      let output: string = "";

      if (format === "markdown") {
        output = `# Issue Details: ${data.shortId}\n\n`;

        // Issue information section
        output += `## Issue Information\n\n`;
        output += `- **Title**: ${data.group.title}\n`;
        output += `- **Status**: ${data.group.status}\n`;
        output += `- **Level**: ${data.group.level}\n`;
        output += `- **First Seen**: ${data.group.firstSeen}\n`;
        output += `- **Last Seen**: ${data.group.lastSeen}\n`;
        output += `- **Event Count**: ${data.group.count}\n`;
        output += `- **User Count**: ${data.group.userCount}\n`;
        output += `- **Culprit**: ${data.group.culprit}\n`;

        // Project information section
        output += `\n## Project Information\n\n`;
        output += `- **Project**: ${data.group.project.name} (${data.group.project.slug})\n`;
        output += `- **Project ID**: ${data.group.project.id}\n`;
        output += `- **Organization**: ${data.organizationSlug}\n`;

        // Links section
        output += `\n## Links\n\n`;
        output += `- **Permalink**: [${data.group.permalink}](${data.group.permalink})\n`;
      } else {
        // Plain text format
        output = `Issue Details: ${data.shortId}\n\n`;

        // Issue information section
        output += `Issue Information:\n\n`;
        output += `Title: ${data.group.title}\n`;
        output += `Status: ${data.group.status}\n`;
        output += `Level: ${data.group.level}\n`;
        output += `First Seen: ${data.group.firstSeen}\n`;
        output += `Last Seen: ${data.group.lastSeen}\n`;
        output += `Event Count: ${data.group.count}\n`;
        output += `User Count: ${data.group.userCount}\n`;
        output += `Culprit: ${data.group.culprit}\n`;

        // Project information section
        output += `\nProject Information:\n\n`;
        output += `Project: ${data.group.project.name} (${data.group.project.slug})\n`;
        output += `Project ID: ${data.group.project.id}\n`;
        output += `Organization: ${data.organizationSlug}\n`;

        // Links section
        output += `\nLinks:\n\n`;
        output += `Permalink: ${data.group.permalink}\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error resolving short ID: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_sentry_event",
  "Retrieve a specific Sentry event from an issue. Requires issue ID/URL and event ID.",
  {
    issue_id_or_url: z
      .string()
      .describe("Either a full Sentry issue URL or just the numeric issue ID"),
    event_id: z.string().describe("The specific event ID to retrieve"),
    organization_slug: z
      .string()
      .describe("The slug of the organization the issue belongs to"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    issue_id_or_url,
    event_id,
    view,
    organization_slug,
    format,
  }: {
    issue_id_or_url: string;
    event_id: string;
    organization_slug: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Retrieving event:", event_id);
      console.error("DEBUG: From issue:", issue_id_or_url);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Extract organization slug from the issue URL if provided
      let organizationSlug = "";

      if (issue_id_or_url.includes("sentry.io")) {
        // Parse the URL to extract organization slug
        const urlParts = issue_id_or_url.split("/");
        const orgIndex = urlParts.indexOf("sentry.io") + 1;
        if (orgIndex < urlParts.length) {
          organizationSlug = urlParts[orgIndex];
        }
      } else {
        // If not a URL, assume it's just the organization slug
        // We need to determine the organization from environment variables or other means
      
        organizationSlug = organization_slug;
      }

      console.error("DEBUG: Organization slug:", organizationSlug);
      console.error("DEBUG: Issue ID:", issue_id_or_url);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/organizations/${organizationSlug}/eventids/${event_id}/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve event: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const data: EventDetailsResponse = await response.json();
      console.error("DEBUG: Event data:", JSON.stringify(data, null, 2));

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        output = `# Event Details: ${data.event.eventID}\n\n`;

        if (view === "detailed") {
          // Event information section
          output += `## Event Information\n\n`;
          output += `- **Title**: ${
            data.event.title || data.event.metadata.title
          }\n`;
          output += `- **Platform**: ${data.event.platform}\n`;
          output += `- **Date Created**: ${data.event.dateCreated}\n`;
          output += `- **Date Received**: ${data.event.dateReceived}\n`;
          output += `- **Size**: ${data.event.size} bytes\n`;
          output += `- **Type**: ${data.event.type}\n`;

          // Tags section
          if (data.event.tags && data.event.tags.length > 0) {
            output += `\n## Tags\n\n`;
            for (const tag of data.event.tags) {
              output += `- **${tag.key}**: ${tag.value}\n`;
            }
          }

          // User information section
          if (data.event.user) {
            output += `\n## User Information\n\n`;
            output += `- **ID**: ${data.event.user.id}\n`;
            if (data.event.user.name)
              output += `- **Name**: ${data.event.user.name}\n`;
            if (data.event.user.email)
              output += `- **Email**: ${data.event.user.email}\n`;
            if (data.event.user.username)
              output += `- **Username**: ${data.event.user.username}\n`;
            if (data.event.user.ip_address)
              output += `- **IP Address**: ${data.event.user.ip_address}\n`;
          }

          // Request information section
          const requestEntry = data.event.entries.find(
            (entry) => entry.type === "request"
          );
          if (requestEntry) {
            output += `\n## Request Information\n\n`;
            if (requestEntry.data.url)
              output += `- **URL**: ${requestEntry.data.url}\n`;
            if (requestEntry.data.method)
              output += `- **Method**: ${requestEntry.data.method}\n`;

            if (
              requestEntry.data.headers &&
              requestEntry.data.headers.length > 0
            ) {
              output += `\n### Headers\n\n`;
              for (const [key, value] of requestEntry.data.headers) {
                output += `- **${key}**: ${value}\n`;
              }
            }
          }

          // Context information
          if (
            data.event.context &&
            Object.keys(data.event.context).length > 0
          ) {
            output += `\n## Context\n\n`;
            output += "```json\n";
            output += JSON.stringify(data.event.context, null, 2);
            output += "\n```\n";
          }

          // Project information section
          output += `\n## Project Information\n\n`;
          output += `- **Organization**: ${data.organizationSlug}\n`;
          output += `- **Project**: ${data.projectSlug}\n`;
          output += `- **Group ID**: ${data.groupId}\n`;
        } else {
          // Summary view
          output += `## Summary\n\n`;
          output += `- **Title**: ${
            data.event.title || data.event.metadata.title
          }\n`;
          output += `- **Platform**: ${data.event.platform}\n`;
          output += `- **Date Created**: ${data.event.dateCreated}\n`;
          output += `- **Organization**: ${data.organizationSlug}\n`;
          output += `- **Project**: ${data.projectSlug}\n`;

          // Add a few important tags if available
          const levelTag = data.event.tags.find((tag) => tag.key === "level");
          const releaseTag = data.event.tags.find(
            (tag) => tag.key === "release"
          );

          if (levelTag) output += `- **Level**: ${levelTag.value}\n`;
          if (releaseTag) output += `- **Release**: ${releaseTag.value}\n`;

          if (data.event.user) {
            output += `- **User**: ${
              data.event.user.email ||
              data.event.user.username ||
              data.event.user.id
            }\n`;
          }
        }
      } else {
        // Plain text format
        output = `Event Details: ${data.event.eventID}\n\n`;

        if (view === "detailed") {
          // Event information section
          output += `Event Information:\n\n`;
          output += `Title: ${data.event.title || data.event.metadata.title}\n`;
          output += `Platform: ${data.event.platform}\n`;
          output += `Date Created: ${data.event.dateCreated}\n`;
          output += `Date Received: ${data.event.dateReceived}\n`;
          output += `Size: ${data.event.size} bytes\n`;
          output += `Type: ${data.event.type}\n`;

          // Tags section
          if (data.event.tags && data.event.tags.length > 0) {
            output += `\nTags:\n\n`;

            for (const tag of data.event.tags) {
              output += `${tag.key}: ${tag.value}\n`;
            }
          }

          // User information section
          if (data.event.user) {
            output += `\nUser Information:\n\n`;
            output += `ID: ${data.event.user.id}\n`;
            if (data.event.user.name)
              output += `Name: ${data.event.user.name}\n`;
            if (data.event.user.email)
              output += `Email: ${data.event.user.email}\n`;
            if (data.event.user.username)
              output += `Username: ${data.event.user.username}\n`;
            if (data.event.user.ip_address)
              output += `IP Address: ${data.event.user.ip_address}\n`;
          }

          // Request information section
          const requestEntry = data.event.entries.find(
            (entry) => entry.type === "request"
          );
          if (requestEntry) {
            output += `\nRequest Information:\n\n`;
            if (requestEntry.data.url)
              output += `URL: ${requestEntry.data.url}\n`;
            if (requestEntry.data.method)
              output += `Method: ${requestEntry.data.method}\n`;

            if (
              requestEntry.data.headers &&
              requestEntry.data.headers.length > 0
            ) {
              output += `\nHeaders:\n\n`;
              for (const [key, value] of requestEntry.data.headers) {
                output += `${key}: ${value}\n`;
              }
            }
          }

          // Context information
          if (
            data.event.context &&
            Object.keys(data.event.context).length > 0
          ) {
            output += `\nContext:\n\n`;
            output += JSON.stringify(data.event.context, null, 2);
            output += "\n";
          }

          // Project information section
          output += `\nProject Information:\n\n`;
          output += `Organization: ${data.organizationSlug}\n`;
          output += `Project: ${data.projectSlug}\n`;
          output += `Group ID: ${data.groupId}\n`;
        } else {
          // Summary view
          output += `Summary:\n\n`;
          output += `Title: ${data.event.title || data.event.metadata.title}\n`;
          output += `Platform: ${data.event.platform}\n`;
          output += `Date Created: ${data.event.dateCreated}\n`;
          output += `Organization: ${data.organizationSlug}\n`;
          output += `Project: ${data.projectSlug}\n`;

          // Add a few important tags if available
          const levelTag = data.event.tags.find((tag) => tag.key === "level");
          const releaseTag = data.event.tags.find(
            (tag) => tag.key === "release"
          );

          if (levelTag) output += `Level: ${levelTag.value}\n`;
          if (releaseTag) output += `Release: ${releaseTag.value}\n`;

          if (data.event.user) {
            output += `User: ${
              data.event.user.email ||
              data.event.user.username ||
              data.event.user.id
            }\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving event: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_error_events_in_project",
  "List error events from a specific Sentry project. View recent errors, frequency patterns, and occurrence timestamps.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization the project belongs to"),
    project_slug: z
      .string()
      .describe("The slug of the project to list events from"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    project_slug,
    view,
    format,
  }: {
    organization_slug: string;
    project_slug: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Listing events for project:", project_slug);
      console.error("DEBUG: In organization:", organization_slug);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/projects/${organization_slug}/${project_slug}/events/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch events: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const events: SentryErrorEvent[] = await response.json();
      console.error("DEBUG: Fetched events:", JSON.stringify(events, null, 2));

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown view
          output = `# Error Events for Project: ${project_slug}\n\n`;

          if (events.length === 0) {
            output += "No events found for this project.\n";
          } else {
            for (let i = 0; i < events.length; i++) {
              const event = events[i];

              output += `## Event ${i + 1}: ${event.title}\n\n`;
              output += `- **Event ID**: ${event.eventID}\n`;
              output += `- **Group ID**: ${event.groupID}\n`;
              output += `- **Date Created**: ${event.dateCreated}\n`;
              output += `- **Platform**: ${event.platform}\n`;
              output += `- **Type**: ${event["event.type"]}\n`;
              output += `- **Location**: ${event.location}\n`;
              output += `- **Culprit**: ${event.culprit}\n`;

              // Add tags section if there are tags
              if (event.tags && event.tags.length > 0) {
                output += `\n### Tags\n\n`;
                output += `| Key | Value |\n`;
                output += `|-----|-------|\n`;

                for (const tag of event.tags) {
                  output += `| ${tag.key} | ${tag.value} |\n`;
                }
              }

              // Add user information if available
              if (event.user) {
                output += `\n### User Information\n\n`;
                if (event.user.id) output += `- **ID**: ${event.user.id}\n`;
                if (event.user.email)
                  output += `- **Email**: ${event.user.email}\n`;
                if (event.user.username)
                  output += `- **Username**: ${event.user.username}\n`;
                if (event.user.ip_address)
                  output += `- **IP Address**: ${event.user.ip_address}\n`;
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `## Summary\n\n`;
            output += `Total Events: ${events.length}\n`;
          }
        } else {
          // Create a summary markdown list
          output = `# Error Events for Project: ${project_slug}\n\n`;

          if (events.length === 0) {
            output += "No events found for this project.\n";
          } else {
            for (const event of events) {
              const level =
                event.tags?.find((tag) => tag.key === "level")?.value ||
                "unknown";
              const environment =
                event.tags?.find((tag) => tag.key === "environment")?.value ||
                "unknown";

              output += `- **${event.title}** (ID: ${event.eventID})\n`;
              output += `  - Level: ${level}, Environment: ${environment}, Platform: ${event.platform}\n`;
              output += `  - Date: ${event.dateCreated}\n\n`;
            }

            output += `Total Events: ${events.length}`;
          }
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = `Error Events for Project: ${project_slug}\n\n`;

          if (events.length === 0) {
            output += "No events found for this project.\n";
          } else {
            for (let i = 0; i < events.length; i++) {
              const event = events[i];

              output += `Event ${i + 1}: ${event.title}\n\n`;
              output += `Event ID: ${event.eventID}\n`;
              output += `Group ID: ${event.groupID}\n`;
              output += `Date Created: ${event.dateCreated}\n`;
              output += `Platform: ${event.platform}\n`;
              output += `Type: ${event["event.type"]}\n`;
              output += `Location: ${event.location}\n`;
              output += `Culprit: ${event.culprit}\n`;

              // Add tags section if there are tags
              if (event.tags && event.tags.length > 0) {
                output += `\nTags:\n\n`;

                for (const tag of event.tags) {
                  output += `${tag.key}: ${tag.value}\n`;
                }
              }

              // Add user information if available
              if (event.user) {
                output += `\nUser Information:\n\n`;
                if (event.user.id) output += `ID: ${event.user.id}\n`;
                if (event.user.email) output += `Email: ${event.user.email}\n`;
                if (event.user.username)
                  output += `Username: ${event.user.username}\n`;
                if (event.user.ip_address)
                  output += `IP Address: ${event.user.ip_address}\n`;
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `Summary:\n\n`;
            output += `Total Events: ${events.length}\n`;
          }
        } else {
          // Create a summary plain text list
          output = `Error Events for Project: ${project_slug}\n\n`;

          if (events.length === 0) {
            output += "No events found for this project.\n";
          } else {
            for (const event of events) {
              const level =
                event.tags?.find((tag) => tag.key === "level")?.value ||
                "unknown";
              const environment =
                event.tags?.find((tag) => tag.key === "environment")?.value ||
                "unknown";

              output += `${event.title} (ID: ${event.eventID})\n`;
              output += `Level: ${level}, Environment: ${environment}, Platform: ${event.platform}\n`;
              output += `Date: ${event.dateCreated}\n\n`;
            }

            output += `Total Events: ${events.length}`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing events: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_project",
  "Create a new project in Sentry. Track deployments, releases, and health metrics.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization to create the project in"),
    team_slug: z
      .string()
      .describe("The slug of the team to associate the project with"),
    name: z.string().describe("The name of the project to create"),
    platform: z
      .string()
      .optional()
      .describe(
        "The platform for the project (e.g., python, javascript, etc.)"
      ),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    team_slug,
    name,
    platform,
    view,
    format,
  }: {
    organization_slug: string;
    team_slug: string;
    name: string;
    platform?: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Creating project:", name);
      console.error("DEBUG: In organization:", organization_slug);
      console.error("DEBUG: For team:", team_slug);
      console.error("DEBUG: Platform:", platform || "not specified");
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Construct the URL for the Sentry API to create a project
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/teams/${organization_slug}/${team_slug}/projects/`;

      // Prepare the request body
      const requestBody: any = {
        name: name,
      };

      // Add platform if specified
      if (platform) {
        requestBody.platform = platform;
      }

      // Make the API request to create the project
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to create project: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const projectData: SentryProjectCreationResponse = await response.json();
      console.error(
        "DEBUG: Created project data:",
        JSON.stringify(projectData, null, 2)
      );

      // Now fetch the client keys for the newly created project
      const keysApiUrl: string = `${SENTRY_BASE_URL}/api/0/projects/${organization_slug}/${projectData.slug}/keys/`;

      // Make the API request to get client keys
      const keysResponse = await fetch(keysApiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the keys request was successful
      if (!keysResponse.ok) {
        const errorText: string = await keysResponse.text();
        console.error(
          "DEBUG: Keys API request failed:",
          keysResponse.status,
          errorText
        );

        // Still return project data but with a warning about keys
        let output: string = "";
        if (format === "markdown") {
          output = `# Project Created: ${projectData.name}\n\n`;
          output += `**Warning**: Failed to fetch client keys: ${keysResponse.status} ${keysResponse.statusText}\n\n`;
          // Add project details...
        } else {
          output = `Project Created: ${projectData.name}\n\n`;
          output += `Warning: Failed to fetch client keys: ${keysResponse.status} ${keysResponse.statusText}\n\n`;
          // Add project details...
        }

        // Return the output with warning
        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      // Parse the keys response
      const clientKeys: SentryClientKey[] = await keysResponse.json();
      console.error(
        "DEBUG: Client keys data:",
        JSON.stringify(clientKeys, null, 2)
      );

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        output = `# Project Created: ${projectData.name}\n\n`;

        if (view === "detailed") {
          // Project information section
          output += `## Project Information\n\n`;
          output += `- **ID**: ${projectData.id}\n`;
          output += `- **Name**: ${projectData.name}\n`;
          output += `- **Slug**: ${projectData.slug}\n`;
          output += `- **Platform**: ${
            projectData.platform || "Not specified"
          }\n`;
          output += `- **Date Created**: ${projectData.dateCreated}\n`;
          output += `- **Status**: ${projectData.status}\n`;

          // Features section
          output += `\n## Features\n\n`;
          output += `- ${projectData.features.join("\n- ")}\n`;

          // Client Keys section
          output += `\n## Client Keys\n\n`;

          for (let i = 0; i < clientKeys.length; i++) {
            const key = clientKeys[i];
            output += `### Key ${i + 1}: ${key.name}\n\n`;
            output += `- **ID**: ${key.id}\n`;
            output += `- **Public Key**: ${key.public}\n`;
            output += `- **Secret Key**: ${key.secret}\n`;
            output += `- **Project ID**: ${key.projectId}\n`;
            output += `- **Is Active**: ${key.isActive}\n`;
            output += `- **Date Created**: ${key.dateCreated}\n\n`;

            output += `#### DSN Information\n\n`;
            output += `- **Public DSN**: \`${key.dsn.public}\`\n`;
            output += `- **Secret DSN**: \`${key.dsn.secret}\`\n`;
            output += `- **CSP Endpoint**: \`${key.dsn.csp}\`\n`;
            output += `- **Security Endpoint**: \`${key.dsn.security}\`\n`;
            output += `- **Minidump Endpoint**: \`${key.dsn.minidump}\`\n`;
            output += `- **CDN URL**: \`${key.dsn.cdn}\`\n\n`;
          }
        } else {
          // Summary view
          output += `## Project Summary\n\n`;
          output += `- **ID**: ${projectData.id}\n`;
          output += `- **Name**: ${projectData.name}\n`;
          output += `- **Slug**: ${projectData.slug}\n`;
          output += `- **Platform**: ${
            projectData.platform || "Not specified"
          }\n\n`;

          output += `## Client Keys Summary\n\n`;

          for (let i = 0; i < clientKeys.length; i++) {
            const key = clientKeys[i];
            output += `### Key ${i + 1}: ${key.name}\n\n`;
            output += `- **Public DSN**: \`${key.dsn.public}\`\n\n`;
          }
        }
      } else {
        // Plain text format
        output = `Project Created: ${projectData.name}\n\n`;

        if (view === "detailed") {
          // Project information section
          output += `Project Information:\n\n`;
          output += `ID: ${projectData.id}\n`;
          output += `Name: ${projectData.name}\n`;
          output += `Slug: ${projectData.slug}\n`;
          output += `Platform: ${projectData.platform || "Not specified"}\n`;
          output += `Date Created: ${projectData.dateCreated}\n`;
          output += `Status: ${projectData.status}\n`;

          // Features section
          output += `\nFeatures:\n\n`;
          for (const feature of projectData.features) {
            output += `- ${feature}\n`;
          }

          // Client Keys section
          output += `\nClient Keys:\n\n`;

          for (let i = 0; i < clientKeys.length; i++) {
            const key = clientKeys[i];
            output += `Key ${i + 1}: ${key.name}\n\n`;
            output += `ID: ${key.id}\n`;
            output += `Public Key: ${key.public}\n`;
            output += `Secret Key: ${key.secret}\n`;
            output += `Project ID: ${key.projectId}\n`;
            output += `Is Active: ${key.isActive}\n`;
            output += `Date Created: ${key.dateCreated}\n\n`;

            output += `DSN Information:\n\n`;
            output += `Public DSN: ${key.dsn.public}\n`;
            output += `Secret DSN: ${key.dsn.secret}\n`;
            output += `CSP Endpoint: ${key.dsn.csp}\n`;
            output += `Security Endpoint: ${key.dsn.security}\n`;
            output += `Minidump Endpoint: ${key.dsn.minidump}\n`;
            output += `CDN URL: ${key.dsn.cdn}\n\n`;
          }
        } else {
          // Summary view
          output += `Project Summary:\n\n`;
          output += `ID: ${projectData.id}\n`;
          output += `Name: ${projectData.name}\n`;
          output += `Slug: ${projectData.slug}\n`;
          output += `Platform: ${projectData.platform || "Not specified"}\n\n`;

          output += `Client Keys Summary:\n\n`;

          for (let i = 0; i < clientKeys.length; i++) {
            const key = clientKeys[i];
            output += `Key ${i + 1}: ${key.name}\n\n`;
            output += `Public DSN: ${key.dsn.public}\n\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error creating project: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_project_issues",
  "List issues from a Sentry project. Monitor issue status, severity, frequency, and timing.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization the project belongs to"),
    project_slug: z
      .string()
      .describe("The slug of the project to list issues from"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    project_slug,
    view,
    format,
  }: {
    organization_slug: string;
    project_slug: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Listing issues for project:", project_slug);
      console.error("DEBUG: In organization:", organization_slug);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/projects/${organization_slug}/${project_slug}/issues/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch project issues: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const issues: SentryProjectIssue[] = await response.json();
      console.error("DEBUG: Fetched issues:", JSON.stringify(issues, null, 2));

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown view
          output = `# Issues for Project: ${project_slug}\n\n`;

          if (issues.length === 0) {
            output += "No issues found for this project.\n";
          } else {
            // Create a table for the issues
            output += `| ID | Short ID | Title | Status | Level | First Seen | Last Seen | Events | Users |\n`;
            output += `|----|----------|-------|--------|-------|------------|-----------|--------|-------|\n`;

            for (const issue of issues) {
              output += `| ${issue.id} | ${issue.shortId} | ${issue.title} | ${issue.status} | ${issue.level} | ${issue.firstSeen} | ${issue.lastSeen} | ${issue.count} | ${issue.userCount} |\n`;
            }

            // Add detailed information for each issue
            output += `\n## Issue Details\n\n`;

            for (let i = 0; i < issues.length; i++) {
              const issue = issues[i];

              output += `### Issue ${i + 1}: ${issue.title}\n\n`;
              output += `- **ID**: ${issue.id}\n`;
              output += `- **Short ID**: ${issue.shortId}\n`;
              output += `- **Status**: ${issue.status}\n`;
              output += `- **Level**: ${issue.level}\n`;
              output += `- **First Seen**: ${issue.firstSeen}\n`;
              output += `- **Last Seen**: ${issue.lastSeen}\n`;
              output += `- **Event Count**: ${issue.count}\n`;
              output += `- **User Count**: ${issue.userCount}\n`;
              output += `- **Culprit**: ${issue.culprit}\n`;
              output += `- **Permalink**: [${issue.permalink}](${issue.permalink})\n`;

              // Add 24h stats if available
              if (
                issue.stats &&
                issue.stats["24h"] &&
                issue.stats["24h"].length > 0
              ) {
                output += `\n#### 24-Hour Event Distribution\n\n`;
                output += `| Timestamp | Count |\n`;
                output += `|-----------|-------|\n`;

                for (const [timestamp, count] of issue.stats["24h"]) {
                  const date = new Date(timestamp * 1000);
                  output += `| ${date.toISOString()} | ${count} |\n`;
                }
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `## Summary\n\n`;
            output += `Total Issues: ${issues.length}\n`;
          }
        } else {
          // Create a summary markdown list
          output = `# Issues for Project: ${project_slug}\n\n`;

          if (issues.length === 0) {
            output += "No issues found for this project.\n";
          } else {
            for (const issue of issues) {
              output += `- **${issue.title}** (${issue.shortId})\n`;
              output += `  - Status: ${issue.status}, Level: ${issue.level}, Events: ${issue.count}\n`;
              output += `  - First seen: ${issue.firstSeen}, Last seen: ${issue.lastSeen}\n\n`;
            }

            output += `Total Issues: ${issues.length}`;
          }
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = `Issues for Project: ${project_slug}\n\n`;

          if (issues.length === 0) {
            output += "No issues found for this project.\n";
          } else {
            for (let i = 0; i < issues.length; i++) {
              const issue = issues[i];

              output += `Issue ${i + 1}: ${issue.title}\n\n`;
              output += `ID: ${issue.id}\n`;
              output += `Short ID: ${issue.shortId}\n`;
              output += `Status: ${issue.status}\n`;
              output += `Level: ${issue.level}\n`;
              output += `First Seen: ${issue.firstSeen}\n`;
              output += `Last Seen: ${issue.lastSeen}\n`;
              output += `Event Count: ${issue.count}\n`;
              output += `User Count: ${issue.userCount}\n`;
              output += `Culprit: ${issue.culprit}\n`;
              output += `Permalink: ${issue.permalink}\n`;

              // Add 24h stats if available
              if (
                issue.stats &&
                issue.stats["24h"] &&
                issue.stats["24h"].length > 0
              ) {
                output += `\n24-Hour Event Distribution:\n\n`;

                for (const [timestamp, count] of issue.stats["24h"]) {
                  const date = new Date(timestamp * 1000);
                  output += `${date.toISOString()}: ${count}\n`;
                }
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `Summary:\n\n`;
            output += `Total Issues: ${issues.length}\n`;
          }
        } else {
          // Create a summary plain text list
          output = `Issues for Project: ${project_slug}\n\n`;

          if (issues.length === 0) {
            output += "No issues found for this project.\n";
          } else {
            for (const issue of issues) {
              output += `${issue.title} (${issue.shortId})\n`;
              output += `Status: ${issue.status}, Level: ${issue.level}, Events: ${issue.count}\n`;
              output += `First seen: ${issue.firstSeen}, Last seen: ${issue.lastSeen}\n\n`;
            }

            output += `Total Issues: ${issues.length}`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing project issues: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_issue_events",
  "List events for a specific Sentry issue. Analyze event details, metadata, and patterns.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization the issue belongs to"),
    issue_id: z.string().describe("The ID of the issue to list events for"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    organization_slug,
    issue_id,
    view,
    format,
  }: {
    organization_slug: string;
    issue_id: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Listing events for issue:", issue_id);
      console.error("DEBUG: In organization:", organization_slug);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/organizations/${organization_slug}/issues/${issue_id}/events/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch issue events: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const events: SentryErrorEvent[] = await response.json();
      console.error("DEBUG: Fetched events:", JSON.stringify(events, null, 2));

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown view
          output = `# Events for Issue: ${issue_id}\n\n`;

          if (events.length === 0) {
            output += "No events found for this issue.\n";
          } else {
            // Create a table for the events
            output += `| Event ID | Title | Platform | Date Created | Location | Culprit |\n`;
            output += `|----------|-------|----------|--------------|----------|----------|\n`;

            for (const event of events) {
              output += `| ${event.eventID} | ${event.title} | ${
                event.platform
              } | ${event.dateCreated} | ${event.location || "N/A"} | ${
                event.culprit || "N/A"
              } |\n`;
            }

            // Add detailed information for each event
            output += `\n## Event Details\n\n`;

            for (let i = 0; i < events.length; i++) {
              const event = events[i];

              output += `### Event ${i + 1}: ${event.title}\n\n`;
              output += `- **Event ID**: ${event.eventID}\n`;
              output += `- **Group ID**: ${event.groupID}\n`;
              output += `- **Date Created**: ${event.dateCreated}\n`;
              output += `- **Platform**: ${event.platform}\n`;
              output += `- **Type**: ${event["event.type"]}\n`;
              output += `- **Location**: ${event.location || "N/A"}\n`;
              output += `- **Culprit**: ${event.culprit || "N/A"}\n`;
              output += `- **Project ID**: ${event.projectID}\n`;

              // Add tags section if there are tags
              if (event.tags && event.tags.length > 0) {
                output += `\n#### Tags\n\n`;
                output += `| Key | Value |\n`;
                output += `|-----|-------|\n`;

                for (const tag of event.tags) {
                  output += `| ${tag.key} | ${tag.value} |\n`;
                }
              }

              // Add user information if available
              if (event.user) {
                output += `\n#### User Information\n\n`;
                if (event.user.id) output += `- **ID**: ${event.user.id}\n`;
                if (event.user.email)
                  output += `- **Email**: ${event.user.email}\n`;
                if (event.user.username)
                  output += `- **Username**: ${event.user.username}\n`;
                if (event.user.ip_address)
                  output += `- **IP Address**: ${event.user.ip_address}\n`;
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `## Summary\n\n`;
            output += `Total Events: ${events.length}\n`;
          }
        } else {
          // Create a summary markdown list
          output = `# Events for Issue: ${issue_id}\n\n`;

          if (events.length === 0) {
            output += "No events found for this issue.\n";
          } else {
            for (const event of events) {
              const level =
                event.tags?.find((tag) => tag.key === "level")?.value ||
                "unknown";
              const environment =
                event.tags?.find((tag) => tag.key === "environment")?.value ||
                "unknown";

              output += `- **Event ID**: ${event.eventID}\n`;
              output += `  - Title: ${event.title}\n`;
              output += `  - Level: ${level}, Environment: ${environment}, Platform: ${event.platform}\n`;
              output += `  - Date: ${event.dateCreated}\n\n`;
            }

            output += `Total Events: ${events.length}`;
          }
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = `Events for Issue: ${issue_id}\n\n`;

          if (events.length === 0) {
            output += "No events found for this issue.\n";
          } else {
            for (let i = 0; i < events.length; i++) {
              const event = events[i];

              output += `Event ${i + 1}: ${event.title}\n\n`;
              output += `Event ID: ${event.eventID}\n`;
              output += `Group ID: ${event.groupID}\n`;
              output += `Date Created: ${event.dateCreated}\n`;
              output += `Platform: ${event.platform}\n`;
              output += `Type: ${event["event.type"]}\n`;
              output += `Location: ${event.location || "N/A"}\n`;
              output += `Culprit: ${event.culprit || "N/A"}\n`;
              output += `Project ID: ${event.projectID}\n`;

              // Add tags section if there are tags
              if (event.tags && event.tags.length > 0) {
                output += `\nTags:\n\n`;

                for (const tag of event.tags) {
                  output += `${tag.key}: ${tag.value}\n`;
                }
              }

              // Add user information if available
              if (event.user) {
                output += `\nUser Information:\n\n`;
                if (event.user.id) output += `ID: ${event.user.id}\n`;
                if (event.user.email) output += `Email: ${event.user.email}\n`;
                if (event.user.username)
                  output += `Username: ${event.user.username}\n`;
                if (event.user.ip_address)
                  output += `IP Address: ${event.user.ip_address}\n`;
              }

              output += `\n---\n\n`;
            }

            // Add summary information
            output += `Summary:\n\n`;
            output += `Total Events: ${events.length}\n`;
          }
        } else {
          // Create a summary plain text list
          output = `Events for Issue: ${issue_id}\n\n`;

          if (events.length === 0) {
            output += "No events found for this issue.\n";
          } else {
            for (const event of events) {
              const level =
                event.tags?.find((tag) => tag.key === "level")?.value ||
                "unknown";
              const environment =
                event.tags?.find((tag) => tag.key === "environment")?.value ||
                "unknown";

              output += `Event ID: ${event.eventID}\n`;
              output += `Title: ${event.title}\n`;
              output += `Level: ${level}, Environment: ${environment}, Platform: ${event.platform}\n`;
              output += `Date: ${event.dateCreated}\n\n`;
            }

            output += `Total Events: ${events.length}`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing issue events: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_sentry_issue",
  "Retrieve and analyze a Sentry issue. Accepts issue URL or ID.",
  {
    issue_id_or_url: z
      .string()
      .describe("Either a full Sentry issue URL or just the numeric issue ID"),
    organization_slug: z
      .string()
      .describe("The slug of the organization the issue belongs to"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
  },
  async ({
    issue_id_or_url,
    organization_slug,
    view,
    format,
  }: {
    issue_id_or_url: string;
    organization_slug: string;
    view: "summary" | "detailed";
    format: "plain" | "markdown";
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Retrieving issue:", issue_id_or_url);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Parse the issue ID from URL if provided
      let organizationSlug = "";

      if (issue_id_or_url.startsWith("http")) {
        // Extract organization slug and issue ID from URL
        const urlPattern =
          /https:\/\/([\w-]+)\.sentry\.io\/(?:organizations\/)?([\w-]+)?(?:\/)?(?:issues\/)?(\d+)/;
        const match = issue_id_or_url.match(urlPattern);

        if (!match) {
          organizationSlug = organization_slug;
        } else {
          organizationSlug = match[1];
          issue_id_or_url = match[3];
        }
      } else {
        organizationSlug = organization_slug;
      }

      console.error("DEBUG: Organization slug:", organizationSlug);
      console.error("DEBUG: Issue ID:", issue_id_or_url);

      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/organizations/${organizationSlug}/issues/${issue_id_or_url}/`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch issue details: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const issue: SentryIssueDetailsResponse = await response.json();
      console.error("DEBUG: Fetched issue:", JSON.stringify(issue, null, 2));

      // Format the output based on the view type and format
      let output: string = "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown view
          output = `# Issue: ${issue.title}\n\n`;

          // Basic issue information
          output += `## Overview\n\n`;
          output += `- **ID**: ${issue.id}\n`;
          output += `- **Short ID**: ${issue.shortId}\n`;
          output += `- **Status**: ${issue.status}\n`;
          output += `- **Level**: ${issue.level}\n`;
          output += `- **First Seen**: ${issue.firstSeen}\n`;
          output += `- **Last Seen**: ${issue.lastSeen}\n`;
          output += `- **Event Count**: ${issue.count}\n`;
          output += `- **User Count**: ${issue.userCount}\n`;
          output += `- **Culprit**: ${issue.culprit}\n`;
          output += `- **Permalink**: [${issue.permalink}](${issue.permalink})\n`;

          // Project information
          output += `\n## Project\n\n`;
          output += `- **Name**: ${issue.project.name}\n`;
          output += `- **ID**: ${issue.project.id}\n`;
          output += `- **Slug**: ${issue.project.slug}\n`;

          // Release information if available
          if (issue.firstRelease) {
            output += `\n## First Release\n\n`;
            output += `- **Version**: ${issue.firstRelease.version}\n`;
            output += `- **Short Version**: ${issue.firstRelease.shortVersion}\n`;
            output += `- **Date Created**: ${issue.firstRelease.dateCreated}\n`;
            output += `- **First Event**: ${issue.firstRelease.firstEvent}\n`;
            output += `- **Last Event**: ${issue.firstRelease.lastEvent}\n`;

            if (
              issue.firstRelease.projects &&
              issue.firstRelease.projects.length > 0
            ) {
              output += `- **Projects**:\n`;
              for (const project of issue.firstRelease.projects) {
                output += `  - ${project.name} (${project.slug})\n`;
              }
            }
          }

          // Activity information
          if (issue.activity && issue.activity.length > 0) {
            output += `\n## Activity\n\n`;
            output += `| Type | Date | User |\n`;
            output += `|------|------|------|\n`;

            for (const activity of issue.activity) {
              const user = activity.user ? activity.user.name : "System";
              output += `| ${activity.type} | ${activity.dateCreated} | ${user} |\n`;
            }
          }

          // Tags if available
          if (issue.tags && issue.tags.length > 0) {
            output += `\n## Tags\n\n`;
            output += `| Key | Value |\n`;
            output += `|-----|-------|\n`;

            for (const tag of issue.tags) {
              output += `| ${tag.key} | ${tag.value} |\n`;
            }
          }

          // 24h stats
          if (
            issue.stats &&
            issue.stats["24h"] &&
            issue.stats["24h"].length > 0
          ) {
            output += `\n## 24-Hour Event Distribution\n\n`;
            output += `| Timestamp | Count |\n`;
            output += `|-----------|-------|\n`;

            for (const [timestamp, count] of issue.stats["24h"]) {
              const date = new Date(timestamp * 1000);
              output += `| ${date.toISOString()} | ${count} |\n`;
            }
          }

          // 30d stats
          if (
            issue.stats &&
            issue.stats["30d"] &&
            issue.stats["30d"].length > 0
          ) {
            output += `\n## 30-Day Event Distribution\n\n`;
            output += `| Date | Count |\n`;
            output += `|------|-------|\n`;

            for (const [timestamp, count] of issue.stats["30d"]) {
              const date = new Date(timestamp * 1000);
              output += `| ${date.toISOString().split("T")[0]} | ${count} |\n`;
            }
          }
        } else {
          // Create a summary markdown view
          output = `# Issue: ${issue.title}\n\n`;

          output += `**Short ID**: ${issue.shortId}\n`;
          output += `**Status**: ${issue.status}, **Level**: ${issue.level}\n`;
          output += `**First Seen**: ${issue.firstSeen}, **Last Seen**: ${issue.lastSeen}\n`;
          output += `**Events**: ${issue.count}, **Users Affected**: ${issue.userCount}\n`;
          output += `**Project**: ${issue.project.name}\n`;
          output += `**Permalink**: [${issue.permalink}](${issue.permalink})\n`;

          // Include a small 24h chart summary
          if (
            issue.stats &&
            issue.stats["24h"] &&
            issue.stats["24h"].length > 0
          ) {
            let total24h = 0;
            for (const [_, count] of issue.stats["24h"]) {
              total24h += count;
            }

            output += `\n**24-Hour Event Count**: ${total24h}\n`;
          }
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = `Issue: ${issue.title}\n\n`;

          // Basic issue information
          output += `Overview:\n\n`;
          output += `ID: ${issue.id}\n`;
          output += `Short ID: ${issue.shortId}\n`;
          output += `Status: ${issue.status}\n`;
          output += `Level: ${issue.level}\n`;
          output += `First Seen: ${issue.firstSeen}\n`;
          output += `Last Seen: ${issue.lastSeen}\n`;
          output += `Event Count: ${issue.count}\n`;
          output += `User Count: ${issue.userCount}\n`;
          output += `Culprit: ${issue.culprit}\n`;
          output += `Permalink: ${issue.permalink}\n`;

          // Project information
          output += `\nProject:\n\n`;

          output += `Name: ${issue.project.name}\n`;
          output += `ID: ${issue.project.id}\n`;
          output += `Slug: ${issue.project.slug}\n`;

          // Release information if available
          if (issue.firstRelease) {
            output += `\nFirst Release:\n\n`;
            output += `Version: ${issue.firstRelease.version}\n`;
            output += `Short Version: ${issue.firstRelease.shortVersion}\n`;
            output += `Date Created: ${issue.firstRelease.dateCreated}\n`;
            output += `First Event: ${issue.firstRelease.firstEvent}\n`;
            output += `Last Event: ${issue.firstRelease.lastEvent}\n`;

            if (
              issue.firstRelease.projects &&
              issue.firstRelease.projects.length > 0
            ) {
              output += `Projects:\n`;
              for (const project of issue.firstRelease.projects) {
                output += `  - ${project.name} (${project.slug})\n`;
              }
            }
          }

          // Activity information
          if (issue.activity && issue.activity.length > 0) {
            output += `\nActivity:\n\n`;

            for (const activity of issue.activity) {
              const user = activity.user ? activity.user.name : "System";
              output += `Type: ${activity.type}, Date: ${activity.dateCreated}, User: ${user}\n`;
            }
          }

          // Tags if available
          if (issue.tags && issue.tags.length > 0) {
            output += `\nTags:\n\n`;

            for (const tag of issue.tags) {
              output += `${tag.key} | ${tag.value}\n`;
            }
          }

          // 24h stats
          if (
            issue.stats &&
            issue.stats["24h"] &&
            issue.stats["24h"].length > 0
          ) {
            output += `\n24-Hour Event Distribution:\n\n`;

            for (const [timestamp, count] of issue.stats["24h"]) {
              const date = new Date(timestamp * 1000);
              output += `${date.toISOString()} | ${count}\n`;
            }
          }

          // 30d stats
          if (
            issue.stats &&
            issue.stats["30d"] &&
            issue.stats["30d"].length > 0
          ) {
            output += `\n30-Day Event Distribution:\n\n`;

            for (const [timestamp, count] of issue.stats["30d"]) {
              const date = new Date(timestamp * 1000);
              output += `${date.toISOString().split("T")[0]}: ${count}\n`;
            }
          }
        } else {
          // Create a summary plain text view
          output = `Issue: ${issue.title}\n\n`;

          output += `Short ID: ${issue.shortId}\n`;
          output += `Status: ${issue.status}, Level: ${issue.level}\n`;
          output += `First Seen: ${issue.firstSeen}, Last Seen: ${issue.lastSeen}\n`;
          output += `Events: ${issue.count}, Users Affected: ${issue.userCount}\n`;
          output += `Project: ${issue.project.name}\n`;
          output += `Permalink: ${issue.permalink}\n`;

          // Include a small 24h chart summary
          if (
            issue.stats &&
            issue.stats["24h"] &&
            issue.stats["24h"].length > 0
          ) {
            let total24h = 0;
            for (const [_, count] of issue.stats["24h"]) {
              total24h += count;
            }

            output += `\n24-Hour Event Count: ${total24h}\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error retrieving issue details: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_organization_replays",
  "List replays from a Sentry organization. Monitor user sessions, interactions, errors, and experience issues.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization to list replays from"),
    project_ids: z
      .array(z.string())
      .optional()
      .describe("Optional array of project IDs to filter replays by"),
    environment: z
      .string()
      .optional()
      .describe("Optional environment to filter replays by"),
    stats_period: z
      .string()
      .optional()
      .describe(
        "Optional time range in format <number><unit> (e.g., '1d' for one day). Units: m (minutes), h (hours), d (days), w (weeks)"
      ),
    start: z
      .string()
      .optional()
      .describe(
        "Optional start of time range (UTC ISO8601 or epoch seconds). Use with 'end' instead of 'stats_period'"
      ),
    end: z
      .string()
      .optional()
      .describe(
        "Optional end of time range (UTC ISO8601 or epoch seconds). Use with 'start' instead of 'stats_period'"
      ),
    sort: z.string().optional().describe("Optional field to sort results by"),
    query: z
      .string()
      .optional()
      .describe("Optional structured query string to filter results"),
    per_page: z
      .number()
      .optional()
      .describe("Optional limit on number of results to return"),
    cursor: z.string().optional().describe("Optional cursor for pagination"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("View type (default: detailed)"),
  },
  async ({
    organization_slug,
    project_ids,
    environment,
    stats_period,
    start,
    end,
    sort,
    query,
    per_page,
    cursor,
    format,
    view,
  }) => {
    try {
      // Debug input
      console.error(
        "DEBUG: Listing replays for organization:",
        organization_slug
      );
      console.error("DEBUG: Project IDs:", project_ids);
      console.error("DEBUG: Environment:", environment);
      console.error("DEBUG: Time range:", stats_period || `${start} to ${end}`);
      console.error("DEBUG: View:", view);
      console.error("DEBUG: Format:", format);

      // Build query parameters
      const queryParams = new URLSearchParams();

      // Add time range parameters
      if (stats_period) {
        queryParams.append("statsPeriod", stats_period);
      } else if (start && end) {
        queryParams.append("start", start);
        queryParams.append("end", end);
      }

      // Add project filter if provided
      if (project_ids && project_ids.length > 0) {
        project_ids.forEach((id) => queryParams.append("project", id));
      }

      // Add environment filter if provided
      if (environment) {
        queryParams.append("environment", environment);
      }

      // Add sort parameter if provided
      if (sort) {
        queryParams.append("sort", sort);
      }

      // Add query filter if provided
      if (query) {
        queryParams.append("query", query);
      }

      // Add pagination parameters if provided
      if (per_page) {
        queryParams.append("per_page", per_page.toString());
      }

      if (cursor) {
        queryParams.append("cursor", cursor);
      }

      // Add fields parameter to get all relevant fields
      const fields = [
        "activity",
        "browser",
        "count_dead_clicks",
        "count_errors",
        "count_rage_clicks",
        "count_segments",
        "count_urls",
        "device",
        "dist",
        "duration",
        "environment",
        "error_ids",
        "finished_at",
        "id",
        "is_archived",
        "os",
        "platform",
        "project_id",
        "releases",
        "sdk",
        "started_at",
        "tags",
        "trace_ids",
        "urls",
        "user",
        "clicks",
        "info_ids",
        "warning_ids",
        "count_warnings",
        "count_infos",
        "has_viewed",
      ];

      fields.forEach((field) => queryParams.append("field", field));

      // Build the URL with query parameters
      const queryString = queryParams.toString();
      const url = `${SENTRY_BASE_URL}/api/0/organizations/${organization_slug}/replays/${
        queryString ? `?${queryString}` : ""
      }`;

      console.error("DEBUG: Request URL:", url);

      // Fetch replays from the Sentry API
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch replays: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      // Parse the response
      const responseData = await response.json();
      const replays = responseData.data || [];
      console.error("DEBUG: Found replays:", replays.length);

      let output = "";

      // Add filter information to output
      const filterInfo: string[] = [];
      if (project_ids && project_ids.length > 0) {
        filterInfo.push(`Projects: ${project_ids.join(", ")}`);
      }
      if (environment) {
        filterInfo.push(`Environment: ${environment}`);
      }
      if (stats_period) {
        filterInfo.push(`Time Range: Last ${stats_period}`);
      } else if (start && end) {
        filterInfo.push(`Time Range: ${start} to ${end}`);
      }

      const filterText =
        filterInfo.length > 0
          ? ` (Filtered by: ${filterInfo.join(" | ")})`
          : "";

      if (format === "markdown") {
        if (view === "detailed") {
          // Create a detailed markdown view
          output = `# Replays for Organization: ${organization_slug}${filterText}\n\n`;

          // Summary table
          output += `## Summary\n\n`;
          output += `| ID | Project ID | Started | Duration | Browser | Platform | Environment | Errors |\n`;
          output += `|:---|:-----------|:--------|:---------|:--------|:---------|:------------|:-------|\n`;

          for (const replay of replays) {
            const startedDate = new Date(replay.started_at).toLocaleString();
            const duration = `${Math.floor(replay.duration / 60)}m ${
              replay.duration % 60
            }s`;
            const browser = replay.browser
              ? `${replay.browser.name} ${replay.browser.version}`
              : "N/A";

            output += `| ${replay.id} | ${replay.project_id} | ${startedDate} | ${duration} | ${browser} | ${replay.platform} | ${replay.environment} | ${replay.count_errors} |\n`;
          }

          // Pagination information if cursor is provided
          if (cursor) {
            output += `\n*Note: This is a paginated result. Use the cursor parameter for the next page.*\n\n`;
          }

          output += `\n## Replay Details\n\n`;

          for (let i = 0; i < replays.length; i++) {
            const replay = replays[i];
            const startedDate = new Date(replay.started_at).toLocaleString();
            const finishedDate = replay.finished_at
              ? new Date(replay.finished_at).toLocaleString()
              : "N/A";
            const duration = `${Math.floor(replay.duration / 60)}m ${
              replay.duration % 60
            }s`;

            output += `### Replay ${i + 1}: ${replay.id}\n\n`;
            output += `- **Project ID**: ${replay.project_id}\n`;
            output += `- **Started**: ${startedDate}\n`;
            output += `- **Finished**: ${finishedDate}\n`;
            output += `- **Duration**: ${duration}\n`;
            output += `- **Environment**: ${replay.environment}\n`;
            output += `- **Platform**: ${replay.platform}\n`;
            output += `- **Activity**: ${replay.activity}\n`;
            output += `- **Viewed**: ${replay.has_viewed ? "Yes" : "No"}\n`;

            // User information if available
            if (replay.user) {
              output += `- **User**: ${
                replay.user.display_name || replay.user.username
              } (${replay.user.email})\n`;
            }

            // Browser information if available
            if (replay.browser) {
              output += `- **Browser**: ${replay.browser.name} ${replay.browser.version}\n`;
            }

            // OS information if available
            if (replay.os) {
              output += `- **OS**: ${replay.os.name} ${replay.os.version}\n`;
            }

            // Device information if available
            if (replay.device) {
              output += `- **Device**: ${replay.device.name} (${replay.device.brand} ${replay.device.model})\n`;
            }

            // SDK information
            output += `- **SDK**: ${replay.sdk.name} ${replay.sdk.version}\n`;

            // Interaction metrics
            output += `- **Dead Clicks**: ${replay.count_dead_clicks}\n`;
            output += `- **Rage Clicks**: ${replay.count_rage_clicks}\n`;
            output += `- **Errors**: ${replay.count_errors}\n`;

            // Include warnings and infos if available
            if ("count_warnings" in replay) {
              output += `- **Warnings**: ${(replay as any).count_warnings}\n`;
            }
            if ("count_infos" in replay) {
              output += `- **Infos**: ${(replay as any).count_infos}\n`;
            }

            output += `- **URLs Visited**: ${replay.count_urls}\n`;

            // URLs if available
            if (replay.urls && replay.urls.length > 0) {
              output += `- **URLs**:\n`;
              for (const url of replay.urls) {
                output += `  - ${url}\n`;
              }
            }

            // Error IDs if available
            if (replay.error_ids && replay.error_ids.length > 0) {
              output += `- **Error IDs**:\n`;
              for (const errorId of replay.error_ids) {
                output += `  - ${errorId}\n`;
              }
            }

            // Warning IDs if available
            if (
              "warning_ids" in replay &&
              (replay as any).warning_ids &&
              (replay as any).warning_ids.length > 0
            ) {
              output += `- **Warning IDs**:\n`;
              for (const warningId of (replay as any).warning_ids) {
                output += `  - ${warningId}\n`;
              }
            }

            // Info IDs if available
            if (
              "info_ids" in replay &&
              (replay as any).info_ids &&
              (replay as any).info_ids.length > 0
            ) {
              output += `- **Info IDs**:\n`;
              for (const infoId of (replay as any).info_ids) {
                output += `  - ${infoId}\n`;
              }
            }

            // Trace IDs if available
            if (replay.trace_ids && replay.trace_ids.length > 0) {
              output += `- **Trace IDs**:\n`;
              for (const traceId of replay.trace_ids) {
                output += `  - ${traceId}\n`;
              }
            }

            // Releases if available
            if (replay.releases && replay.releases.length > 0) {
              output += `- **Releases**:\n`;
              for (const release of replay.releases) {
                output += `  - ${release}\n`;
              }
            }

            // Tags if available
            if (replay.tags && Object.keys(replay.tags).length > 0) {
              output += `- **Tags**:\n`;
              for (const [key, values] of Object.entries(replay.tags)) {
                output += `  - ${key}: ${(values as string[]).join(", ")}\n`;
              }
            }

            output += `\n`;
          }
        } else {
          // Create a summary markdown view
          output = `# Replays for Organization: ${organization_slug}${filterText}\n\n`;
          output += `| ID | Project ID | Started | Duration | Browser | Platform | Environment | Errors |\n`;
          output += `|:---|:-----------|:--------|:---------|:--------|:---------|:------------|:-------|\n`;

          for (const replay of replays) {
            const startedDate = new Date(replay.started_at).toLocaleString();
            const duration = `${Math.floor(replay.duration / 60)}m ${
              replay.duration % 60
            }s`;
            const browser = replay.browser
              ? `${replay.browser.name} ${replay.browser.version}`
              : "N/A";

            output += `| ${replay.id} | ${replay.project_id} | ${startedDate} | ${duration} | ${browser} | ${replay.platform} | ${replay.environment} | ${replay.count_errors} |\n`;
          }

          // Pagination information if cursor is provided
          if (cursor) {
            output += `\n*Note: This is a paginated result. Use the cursor parameter for the next page.*\n`;
          }
        }
      } else {
        // Plain text format
        if (view === "detailed") {
          output = `Replays for Organization: ${organization_slug}${filterText}\n\n`;

          for (let i = 0; i < replays.length; i++) {
            const replay = replays[i];
            const startedDate = new Date(replay.started_at).toLocaleString();
            const finishedDate = replay.finished_at
              ? new Date(replay.finished_at).toLocaleString()
              : "N/A";
            const duration = `${Math.floor(replay.duration / 60)}m ${
              replay.duration % 60
            }s`;

            output += `Replay ${i + 1}: ${replay.id}\n`;
            output += `Project ID: ${replay.project_id}\n`;
            output += `Started: ${startedDate}\n`;
            output += `Finished: ${finishedDate}\n`;
            output += `Duration: ${duration}\n`;
            output += `Environment: ${replay.environment}\n`;
            output += `Platform: ${replay.platform}\n`;
            output += `Activity: ${replay.activity}\n`;
            output += `Viewed: ${replay.has_viewed ? "Yes" : "No"}\n`;

            // User information if available
            if (replay.user) {
              output += `User: ${
                replay.user.display_name || replay.user.username
              } (${replay.user.email})\n`;
            }

            // Browser information if available
            if (replay.browser) {
              output += `Browser: ${replay.browser.name} ${replay.browser.version}\n`;
            }

            // OS information if available
            if (replay.os) {
              output += `OS: ${replay.os.name} ${replay.os.version}\n`;
            }

            // Device information if available
            if (replay.device) {
              output += `Device: ${replay.device.name} (${replay.device.brand} ${replay.device.model})\n`;
            }

            // SDK information
            output += `SDK: ${replay.sdk.name} ${replay.sdk.version}\n`;

            // Interaction metrics
            output += `Dead Clicks: ${replay.count_dead_clicks}\n`;
            output += `Rage Clicks: ${replay.count_rage_clicks}\n`;
            output += `Errors: ${replay.count_errors}\n`;

            // Include warnings and infos if available
            if ("count_warnings" in replay) {
              output += `Warnings: ${(replay as any).count_warnings}\n`;
            }
            if ("count_infos" in replay) {
              output += `Infos: ${(replay as any).count_infos}\n`;
            }

            output += `URLs Visited: ${replay.count_urls}\n`;

            // URLs if available
            if (replay.urls && replay.urls.length > 0) {
              output += `URLs:\n`;
              for (const url of replay.urls) {
                output += `  ${url}\n`;
              }
            }

            // Error IDs if available
            if (replay.error_ids && replay.error_ids.length > 0) {
              output += `Error IDs:\n`;
              for (const errorId of replay.error_ids) {
                output += `  ${errorId}\n`;
              }
            }

            // Warning IDs if available
            if (
              "warning_ids" in replay &&
              (replay as any).warning_ids &&
              (replay as any).warning_ids.length > 0
            ) {
              output += `Warning IDs:\n`;
              for (const warningId of (replay as any).warning_ids) {
                output += `  ${warningId}\n`;
              }
            }

            // Info IDs if available
            if (
              "info_ids" in replay &&
              (replay as any).info_ids &&
              (replay as any).info_ids.length > 0
            ) {
              output += `Info IDs:\n`;
              for (const infoId of (replay as any).info_ids) {
                output += `  ${infoId}\n`;
              }
            }

            // Trace IDs if available
            if (replay.trace_ids && replay.trace_ids.length > 0) {
              output += `Trace IDs:\n`;
              for (const traceId of replay.trace_ids) {
                output += `  ${traceId}\n`;
              }
            }

            // Releases if available
            if (replay.releases && replay.releases.length > 0) {
              output += `Releases:\n`;
              for (const release of replay.releases) {
                output += `  ${release}\n`;
              }
            }

            // Tags if available
            if (replay.tags && Object.keys(replay.tags).length > 0) {
              output += `Tags:\n`;
              for (const [key, values] of Object.entries(replay.tags)) {
                output += `  ${key}: ${(values as string[]).join(", ")}\n`;
              }
            }

            output += `\n`;
          }

          // Pagination information if cursor is provided
          if (cursor) {
            output += `Note: This is a paginated result. Use the cursor parameter for the next page.\n`;
          }
        } else {
          // Create a summary plain text view
          output = `Replays for Organization: ${organization_slug}${filterText}\n\n`;

          for (const replay of replays) {
            const startedDate = new Date(replay.started_at).toLocaleString();
            const duration = `${Math.floor(replay.duration / 60)}m ${
              replay.duration % 60
            }s`;
            const browser = replay.browser
              ? `${replay.browser.name} ${replay.browser.version}`
              : "N/A";

            output += `ID: ${replay.id}, Project ID: ${replay.project_id}, Started: ${startedDate}, Duration: ${duration}, Browser: ${browser}, Platform: ${replay.platform}, Environment: ${replay.environment}, Errors: ${replay.count_errors}\n`;
          }

          // Pagination information if cursor is provided
          if (cursor) {
            output += `\nNote: This is a paginated result. Use the cursor parameter for the next page.\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing replays: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "setup_sentry",
  "Set up Sentry for a project returning a dsn and instructions for setup.",
  {
    organization_slug: z.string().describe("The slug of the organization to create the project in"),
    team_slug: z.string().describe("The slug of the team to associate the project with"),
    project_name: z.string().describe("The name of the project to create"),
    environment: z.string().optional().describe("Optional environment name (e.g., production, staging, development)"),
    format: z.enum(["plain", "markdown"]).default("markdown").describe("Output format (default: markdown)")
  },
  async ({ organization_slug, team_slug, project_name, environment, format }: {
    organization_slug: string;
    team_slug: string;
    project_name: string;
    environment?: string;
    format: "plain" | "markdown"
  }) => {
    try {
      // Debug input
      console.error('DEBUG: Setting up Sentry for project:', project_name);
      console.error('DEBUG: In organization:', organization_slug);
      console.error('DEBUG: For team:', team_slug);
      console.error('DEBUG: Environment:', environment);

      // Step 1: Create the project
      const createProjectUrl = `${SENTRY_BASE_URL}/api/0/teams/${organization_slug}/${team_slug}/projects/`;
      
      const createProjectResponse = await fetch(createProjectUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENTRY_AUTH}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: project_name
        })
      });

      if (!createProjectResponse.ok) {
        const errorText = await createProjectResponse.text();
        console.error('DEBUG: Project creation failed:', createProjectResponse.status, errorText);
        return {
          content: [{
            type: "text",
            text: `Failed to create Sentry project: ${createProjectResponse.status} ${createProjectResponse.statusText}\n${errorText}`
          }],
          isError: true
        };
      }

      const projectData: SentryProjectCreationResponse = await createProjectResponse.json();
      console.error('DEBUG: Project created:', JSON.stringify(projectData, null, 2));

      // Step 2: Get the client keys (DSN)
      const clientKeysUrl = `${SENTRY_BASE_URL}/api/0/projects/${organization_slug}/${projectData.slug}/keys/`;
      
      const clientKeysResponse = await fetch(clientKeysUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SENTRY_AUTH}`,
          'Content-Type': 'application/json'
        }
      });

      if (!clientKeysResponse.ok) {
        const errorText = await clientKeysResponse.text();
        console.error('DEBUG: Client keys fetch failed:', clientKeysResponse.status, errorText);
        return {
          content: [{
            type: "text",
            text: `Failed to fetch client keys: ${clientKeysResponse.status} ${clientKeysResponse.statusText}\n${errorText}`
          }],
          isError: true
        };
      }

      const clientKeys: SentryClientKey[] = await clientKeysResponse.json();
      console.error('DEBUG: Client keys fetched:', JSON.stringify(clientKeys, null, 2));

      if (clientKeys.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No client keys found for the project. Please check the project settings.`
          }],
          isError: true
        };
      }

      const dsn = clientKeys[0].dsn.public;

      // Prepare setup response
      const setupResponse: SentrySetupResponse = {
        projectName: projectData.name,
        projectSlug: projectData.slug,
        projectId: projectData.id,
        dsn: dsn,
        installationInstructions: {
          generic: `Sentry.init({
            dsn: "${dsn}",
            ${environment ? `environment: "${environment}",` : ''}
            // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
            tracesSampleRate: 1.0,
          });`
        }
      };

      // Format the output
      let output = '';

      if (format === 'markdown') {
        output = `# Sentry Project Setup: ${setupResponse.projectName}\n\n`;
        output += `## Project Information\n\n`;
        output += `- **Project Name**: ${setupResponse.projectName}\n`;
        output += `- **Project Slug**: ${setupResponse.projectSlug}\n`;
        if (environment) {
          output += `- **Environment**: ${environment}\n`;
        }
        output += `- **DSN**: \`${setupResponse.dsn}\`\n\n`;

        output += `## Installation Instructions\n\n`;
        output += `## Next Steps\n\n`;
        output += `1. Choose the appropriate SDK for your platform and follow the installation instructions above.\n`;
        output += `2. Configure additional options as needed for your specific use case.\n`;
        output += `3. Test your integration by triggering a test event.\n`;
        output += `4. Visit your [Sentry dashboard](${SENTRY_BASE_URL}/organizations/${organization_slug}/issues/) to view and manage your errors.\n`;
      } else {
        // Plain text format
        output = `Sentry Project Setup: ${setupResponse.projectName}\n\n`;
        output += `Project Information:\n`;
        output += `- Project Name: ${setupResponse.projectName}\n`;
        output += `- Project Slug: ${setupResponse.projectSlug}\n`;
        if (environment) {
          output += `- Environment: ${environment}\n`;
        }
        output += `- DSN: ${setupResponse.dsn}\n\n`;

        output += `Installation Instructions:\n\n`;
        output += `Generic Setup:\n`;
        output += setupResponse.installationInstructions.generic.trim();
        output += "\n\n";
        
        output += `Next Steps:\n`;
        output += `1. Choose the appropriate SDK for your platform and follow the installation instructions above.\n`;
        output += `2. Configure additional options as needed for your specific use case.\n`;
        output += `3. Test your integration by triggering a test event.\n`;
        output += `4. Visit your Sentry dashboard to view and manage your errors: ${SENTRY_BASE_URL}/organizations/${organization_slug}/issues/\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing replays: ${error.message}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "search_errors_in_file",
  "Search for Sentry errors occurring in a specific file. Find all issues related to a particular file path or filename.",
  {
    organization_slug: z
      .string()
      .describe("The slug of the organization in Sentry"),
    project_slug: z
      .string()
      .describe("The slug of the project in Sentry"),
    file_identifier: z
      .string()
      .describe("The path or name of the file to search for errors in"),
    identifier_type: z
      .enum(["filename", "filepath"])
      .describe("Whether to search by filename or full filepath"),
    format: z
      .enum(["plain", "markdown"])
      .default("markdown")
      .describe("Output format (default: markdown)"),
    view: z
      .enum(["summary", "detailed"])
      .default("detailed")
      .describe("Level of detail in results (default: detailed)"),
  },
  async ({
    organization_slug,
    project_slug,
    file_identifier,
    identifier_type,
    format,
    view,
  }: {
    organization_slug: string;
    project_slug: string;
    file_identifier: string;
    identifier_type: "filename" | "filepath";
    format: "plain" | "markdown";
    view: "summary" | "detailed";
    time_range?: string;
  }) => {
    try {
      // Debug input
      console.error("DEBUG: Searching for errors in file:", file_identifier);
      console.error("DEBUG: Identifier type:", identifier_type);
      console.error("DEBUG: Organization:", organization_slug);
      console.error("DEBUG: Project:", project_slug);
      
      // Construct the query based on identifier type
      let query = identifier_type === "filepath" 
        ? `stack.filename:"*${file_identifier}"`
        : `stack.filename:"*${file_identifier}"`;
            
      // Construct the URL for the Sentry API
      const apiUrl: string = `${SENTRY_BASE_URL}/api/0/projects/${organization_slug}/${project_slug}/issues/?query=${encodeURIComponent(query)}`;

      // Make the API request
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH}`,
          "Content-Type": "application/json",
        },
      });

      // Check if the request was successful
      if (!response.ok) {
        const errorText: string = await response.text();
        console.error("DEBUG: API request failed:", response.status, errorText);
        return {
          content: [
            {
              type: "text",
              text: `Failed to search for errors: ${response.status} ${response.statusText}\n${errorText}`,
            },
          ],
          isError: true,
        };
      }

      // Parse the response
      const issues: SentryProjectIssue[] = await response.json();
      console.error(
        "DEBUG: Found issues:",
        JSON.stringify(issues, null, 2)
      );

      // Format the output based on the view type and format
      let output: string = "";
      
      if (issues.length === 0) {
        output = format === "markdown" 
          ? `# No issues found\n\nNo errors found for ${identifier_type} \`${file_identifier}\` in project \`${project_slug}\`.`
          : `No issues found\n\nNo errors found for ${identifier_type} ${file_identifier} in project ${project_slug}.`;
          
        return {
          content: [{ type: "text", text: output }],
        };
      }

      if (format === "markdown") {
        output = `# Errors in ${identifier_type}: \`${file_identifier}\`\n\n`;
        
        if (view === "detailed") {
          for (const issue of issues) {
            output += `## ${issue.shortId}: ${issue.title}\n\n`;
            output += `- **Status**: ${issue.status}\n`;
            output += `- **Level**: ${issue.level}\n`;
            output += `- **First Seen**: ${issue.firstSeen}\n`;
            output += `- **Last Seen**: ${issue.lastSeen}\n`;
            output += `- **Events**: ${issue.count}\n`;
            output += `- **Users Affected**: ${issue.userCount}\n`;
            output += `- **Culprit**: ${issue.culprit}\n`;
            output += `- **Link**: [View in Sentry](${issue.permalink})\n\n`;
            
            if (issue.metadata && Object.keys(issue.metadata).length > 0) {
              output += `### Metadata\n\n`;
              for (const [key, value] of Object.entries(issue.metadata)) {
                output += `- **${key}**: ${value}\n`;
              }
              output += `\n`;
            }
          }
          
          // Add summary at the end
          output += `## Summary\n\n`;
          output += `- **Total Issues**: ${issues.length}\n`;
          output += `- **Project**: ${project_slug}\n`;
          output += `- **Organization**: ${organization_slug}\n`;
        } else {
          // Summary view
          output += `| Issue ID | Title | Status | Level | Events | Last Seen |\n`;
          output += `|----------|-------|--------|-------|--------|----------|\n`;
          
          for (const issue of issues) {
            output += `| [${issue.shortId}](${issue.permalink}) | ${issue.title} | ${issue.status} | ${issue.level} | ${issue.count} | ${issue.lastSeen} |\n`;
          }
          
          output += `\n**Total Issues**: ${issues.length}\n`;
        }
      } else {
        // Plain text format
        output = `Errors in ${identifier_type}: ${file_identifier}\n\n`;
        
        if (view === "detailed") {
          for (const issue of issues) {
            output += `${issue.shortId}: ${issue.title}\n`;
            output += `Status: ${issue.status}\n`;
            output += `Level: ${issue.level}\n`;
            output += `First Seen: ${issue.firstSeen}\n`;
            output += `Last Seen: ${issue.lastSeen}\n`;
            output += `Events: ${issue.count}\n`;
            output += `Users Affected: ${issue.userCount}\n`;
            output += `Culprit: ${issue.culprit}\n`;
            output += `Link: ${issue.permalink}\n\n`;
            
            if (issue.metadata && Object.keys(issue.metadata).length > 0) {
              output += `Metadata:\n`;
              for (const [key, value] of Object.entries(issue.metadata)) {
                output += `${key}: ${value}\n`;
              }
              output += `\n`;
            }
          }
          
          // Add summary at the end
          output += `Summary:\n\n`;
          output += `Total Issues: ${issues.length}\n`;
          output += `Project: ${project_slug}\n`;
          output += `Organization: ${organization_slug}\n`;
        } else {
          // Summary view
          for (const issue of issues) {
            output += `${issue.shortId} | ${issue.title} | ${issue.status} | ${issue.level} | ${issue.count} events | ${issue.lastSeen}\n`;
          }
          
          output += `\nTotal Issues: ${issues.length}\n`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: any) {
      console.error("DEBUG: Caught error:", error);      
      return {
        content: [
          {
            type: "text",
            text: `Error searching for file errors: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main(): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Sentry MCP Server running");
  } catch (error: any) {
    throw error;
  }
}

main().catch((error: Error) => {
  console.error("Fatal error in main():", error);
});
