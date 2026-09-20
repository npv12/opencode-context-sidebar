import type { SessionMessageInfo } from "@opencode/client";
import { Database } from "bun:sqlite";

export const MAX_SESSION_MESSAGES = 5_000;

const databasePath = `${process.env.HOME}/.local/share/opencode/opencode.db`;
let database: Database | undefined;

function openDatabase(): Database {
  return (database ??= new Database(databasePath, { readonly: true }));
}

export function loadSessionMessages(sessionID: string): SessionMessageInfo[] {
  try {
    const rows = openDatabase()
      .query<{ id: string; session_id: string; type: string; data: string }, [string, number]>(
        `SELECT id, session_id, type, data
         FROM session_message
         WHERE session_id = ?
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .all(sessionID, MAX_SESSION_MESSAGES);

    return rows.reverse().flatMap((row) => {
      try {
        return [{ ...JSON.parse(row.data), id: row.id, sessionID: row.session_id, type: row.type } as SessionMessageInfo];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
