import { drop } from "@mswjs/data";
import Decimal from "decimal.js";
import { IssueActivity } from "../src/issue-activity.ts";
import { ContentEvaluatorModule } from "../src/parser/content-evaluator-module.ts";
import { DataPurgeModule } from "../src/parser/data-purge-module.ts";
import { FormattingEvaluatorModule } from "../src/parser/formatting-evaluator-module.ts";
import { GithubCommentModule } from "../src/parser/github-comment-module.ts";
import { PermitGenerationModule } from "../src/parser/permit-generation-module.ts";
import { Processor } from "../src/parser/processor.ts";
import { UserExtractorModule } from "../src/parser/user-extractor-module.ts";
import { parseGitHubUrl } from "../src/start.ts";
import "../src/parser/command-line";
import { db, db as mockDb } from "./__mocks__/db.ts";
import dbSeed from "./__mocks__/db-seed.json";

const issueUrl = "https://github.com/ubiquity/work.ubq.fi/issues/69";

jest.spyOn(ContentEvaluatorModule.prototype, "_evaluateComments").mockImplementation((specification, comments) => {
  return Promise.resolve(comments.map(() => new Decimal(0.8)));
});

jest.mock("@ubiquibot/permit-generation/core", () => {
  const originalModule = jest.requireActual("@ubiquibot/permit-generation/core");

  return {
    __esModule: true,
    ...originalModule,
    createAdapters: jest.fn(() => {
      return {
        supabase: {
          wallet: {
            getWalletByUserId: jest.fn((userId: number) => {
              const wallet = mockDb.wallets.findFirst({
                where: {
                  userId: {
                    equals: userId,
                  },
                },
              });
              if (!wallet) {
                return Promise.resolve(null);
              }
              return Promise.resolve(wallet.address);
            }),
          },
        },
      };
    }),
  };
});

jest.mock("../src/parser/command-line", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cfg = require("./__mocks__/results/valid-configuration.json");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  dotenv.config();
  return {
    stateId: 1,
    eventName: "issues.closed",
    authToken: process.env.GITHUB_TOKEN,
    ref: "",
    eventPayload: {
      issue: {
        html_url: issueUrl,
        number: 1,
        state_reason: "completed",
      },
      repository: {
        name: "conversation-rewards",
        owner: {
          login: "ubiquibot",
        },
      },
    },
    settings: JSON.stringify(cfg),
  };
});

jest.mock("@supabase/supabase-js", () => {
  return {
    createClient: jest.fn(() => ({
      from: jest.fn(() => ({
        insert: jest.fn(() => ({})),
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => ({
              data: {
                id: 1,
              },
            })),
            eq: jest.fn(() => ({
              single: jest.fn(() => ({
                data: {
                  id: 1,
                },
              })),
            })),
          })),
        })),
      })),
    })),
  };
});

describe("Rewards tests", () => {
  const issue = parseGitHubUrl(issueUrl);
  const activity = new IssueActivity(issue);

  beforeEach(async () => {
    drop(db);
    for (const table of Object.keys(dbSeed)) {
      const tableName = table as keyof typeof dbSeed;
      for (const row of dbSeed[tableName]) {
        db[tableName].create(row);
      }
    }
    await activity.init();
  });

  it("Should split the rewards between multiple assignees", async () => {
    const processor = new Processor();
    processor["_transformers"] = [
      new UserExtractorModule(),
      new DataPurgeModule(),
      new FormattingEvaluatorModule(),
      new ContentEvaluatorModule(),
      new PermitGenerationModule(),
      new GithubCommentModule(),
    ];
    await processor.run(activity);
    processor.dump();
  });
});