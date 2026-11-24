import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, GitMerge, Lock, Server, Smartphone, X } from "lucide-react";
import { useSyncStore } from "../../store/useSyncStore";
import { syncEngine } from "../../offline/syncEngine";
import type { SyncConflictItem } from "../../offline/syncTypes";

function formatDisplayValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function formatFieldLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

interface ConflictCardProps {
  conflict: SyncConflictItem;
}

const ConflictCard: React.FC<ConflictCardProps> = ({ conflict }) => {
  const isLocked = conflict.reason === "LOCKED_VERIFIED";
  const isDeleted = conflict.reason === "RECORD_DELETED";

  const fields = useMemo(() => {
    const keys =
      conflict.conflictFields.length > 0
        ? conflict.conflictFields
        : Object.keys(conflict.localChanges);
    return keys.filter((k) => k !== "sessionId" && k !== "studentId" && k !== "examId" && k !== "subjectId");
  }, [conflict]);

  const [selectedSource, setSelectedSource] = useState<Record<string, "local" | "server">>(() => {
    const init: Record<string, "local" | "server"> = {};
    for (const f of fields) init[f] = "local";
    return init;
  });
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (mode: "keep_mine" | "keep_server" | "merge") => {
    setResolving(true);
    try {
      if (mode === "merge") {
        const mergedFields: Record<string, unknown> = {};
        for (const f of fields) {
          mergedFields[f] =
            selectedSource[f] === "local"
              ? conflict.localChanges[f]
              : conflict.serverRecord?.[f];
        }
        await syncEngine.resolveConflict(conflict.id, { mode: "merge", mergedFields });
      } else {
        await syncEngine.resolveConflict(conflict.id, { mode });
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="border border-neutral-200 rounded-xl bg-white shadow-2xs overflow-hidden">
      <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-red-100 text-red-700">
              {conflict.entityType.replace("_", " ")}
            </span>
            <h4 className="font-semibold text-sm text-neutral-900">
              {conflict.entityLabel}
            </h4>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {isLocked
              ? "This record was verified and locked by an administrator on the server while you were offline."
              : isDeleted
                ? "This record was deleted on the server while you edited it offline."
                : "Another user updated the same field(s) on the server while you were offline."}
          </p>
        </div>
        {isLocked && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 shrink-0">
            <Lock size={12} /> Verified Lock
          </span>
        )}
      </div>

      {!isDeleted && fields.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50/70 text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Smartphone size={12} className="text-brand-600" /> Your Offline Edit
                  </span>
                </th>
                <th className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Server size={12} className="text-emerald-600" /> Current Server Value
                  </span>
                </th>
                {!isLocked && fields.length > 1 && (
                  <th className="px-4 py-2 font-medium text-right">Pick for Merge</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {fields.map((field) => {
                const localVal = conflict.localChanges[field];
                const serverVal = conflict.serverRecord?.[field];
                return (
                  <tr key={field} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-2.5 font-medium text-neutral-700">
                      {formatFieldLabel(field)}
                    </td>
                    <td className="px-4 py-2.5 text-brand-900 bg-brand-50/40 font-medium">
                      {formatDisplayValue(localVal)}
                    </td>
                    <td className="px-4 py-2.5 text-emerald-900 bg-emerald-50/40 font-medium">
                      {formatDisplayValue(serverVal)}
                    </td>
                    {!isLocked && fields.length > 1 && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex rounded-lg border border-neutral-200 overflow-hidden text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSource((prev) => ({ ...prev, [field]: "local" }))
                            }
                            className={`px-2 py-1 font-medium ${
                              selectedSource[field] === "local"
                                ? "bg-brand-600 text-white"
                                : "bg-white text-neutral-600 hover:bg-neutral-50"
                            }`}
                          >
                            Mine
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSource((prev) => ({ ...prev, [field]: "server" }))
                            }
                            className={`px-2 py-1 font-medium ${
                              selectedSource[field] === "server"
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-neutral-600 hover:bg-neutral-50"
                            }`}
                          >
                            Server
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-3 bg-neutral-50/60 border-t border-neutral-200 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={resolving}
          onClick={() => void handleResolve("keep_server")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          <Check size={13} />
          {isLocked ? "Accept Verified Server Value" : "Keep Server"}
        </button>

        {!isLocked && !isDeleted && fields.length > 1 && (
          <button
            type="button"
            disabled={resolving}
            onClick={() => void handleResolve("merge")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            <GitMerge size={13} />
            Save Field Merge
          </button>
        )}

        {!isLocked && !isDeleted && (
          <button
            type="button"
            disabled={resolving}
            onClick={() => void handleResolve("keep_mine")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Smartphone size={13} />
            Keep Mine (Overwrite)
          </button>
        )}
      </div>
    </div>
  );
};

export const ConflictResolutionModal: React.FC = () => {
  const { isConflictModalOpen, setConflictModalOpen, conflicts } = useSyncStore();

  if (!isConflictModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-neutral-50 rounded-2xl shadow-xl border border-neutral-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-white border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900">
                Resolve Sync Conflicts ({conflicts.length})
              </h3>
              <p className="text-xs text-neutral-500">
                Non-overlapping edits were auto-merged. Choose how to resolve these same-field conflicts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConflictModalOpen(false)}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {conflicts.length === 0 ? (
            <div className="text-center py-10 text-neutral-500 text-sm">
              All conflicts have been resolved!
            </div>
          ) : (
            conflicts.map((conflict) => (
              <ConflictCard key={conflict.id} conflict={conflict} />
            ))
          )}
        </div>

        <div className="px-6 py-3 bg-white border-t border-neutral-200 flex justify-end">
          <button
            type="button"
            onClick={() => setConflictModalOpen(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
