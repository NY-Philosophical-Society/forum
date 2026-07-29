"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatDate,
  type AdminUserSummary,
  type AdminUsersResponse,
} from "@nyps-forum/shared";
import { api } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import { useSettings } from "~/lib/settings-context";
import { Avatar, ConfirmAction, EmptyState, Skeleton, StatusBadge } from "../../ui";
import { AdminFilters, AdminSearch, AdminSelect } from "../admin-ui";

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const { user: me, token } = useAuth();
  const { dateFormat } = useSettings();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [verification, setVerification] = useState("");
  const [flag, setFlag] = useState("");
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextOffset: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (search) qs.set("search", search);
        if (role) qs.set("role", role);
        if (verification) qs.set("verification", verification);
        if (flag) qs.set(flag, "1");
        const res = await api.get<AdminUsersResponse>(`/api/admin/users?${qs.toString()}`, token);
        setData(res);
        setOffset(nextOffset);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [token, search, role, verification, flag],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <div>
      <AdminFilters>
        <AdminSearch value={search} placeholder="Name or email" onSubmit={setSearch} />
        <AdminSelect
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: "", label: "Any role" },
            { value: "admin", label: "Admins" },
            { value: "user", label: "Members" },
          ]}
        />
        <AdminSelect
          label="Verification"
          value={verification}
          onChange={setVerification}
          options={[
            { value: "", label: "Any status" },
            { value: "VERIFIED", label: "Verified" },
            { value: "PENDING", label: "Pending" },
            { value: "UNVERIFIED", label: "Unverified" },
            { value: "REJECTED", label: "Rejected" },
          ]}
        />
        <AdminSelect
          label="Flag"
          value={flag}
          onChange={setFlag}
          options={[
            { value: "", label: "Everyone" },
            { value: "banned", label: "Banned only" },
            { value: "supporter", label: "Supporters only" },
          ]}
        />
        <p className="meta admin-filter-count">
          {data ? `${data.total} matching · ${data.adminCount} admin${data.adminCount === 1 ? "" : "s"}` : "…"}
        </p>
      </AdminFilters>

      {error && <p className="error">{error}</p>}

      {loading && (
        <>
          <Skeleton style={{ height: "4rem", marginBottom: "0.5rem", borderRadius: 10 }} />
          <Skeleton style={{ height: "4rem", borderRadius: 10 }} />
        </>
      )}

      {!loading && data?.users.length === 0 && !error && (
        <EmptyState title="No members match" hint="Loosen the filters above." />
      )}

      {!loading &&
        data?.users.map((u) => (
          <UserRow
            key={u.id}
            member={u}
            myId={me?.id ?? ""}
            adminCount={data.adminCount}
            dateFormat={dateFormat}
            token={token}
            onChanged={() => load(offset)}
          />
        ))}

      {!loading && data && (data.hasMore || offset > 0) && (
        <div className="row" style={{ marginTop: "1rem" }}>
          <button
            className="secondary btn-sm"
            disabled={offset === 0}
            onClick={() => load(Math.max(offset - PAGE_SIZE, 0))}
          >
            ← Newer
          </button>
          <button
            className="secondary btn-sm"
            disabled={!data.hasMore}
            onClick={() => load(offset + PAGE_SIZE)}
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}

function UserRow({
  member,
  myId,
  adminCount,
  dateFormat,
  token,
  onChanged,
}: {
  member: AdminUserSummary;
  myId: string;
  adminCount: number;
  dateFormat: Parameters<typeof formatDate>[1];
  token: string | null;
  onChanged: () => void;
}) {
  // The API refuses this too — this only keeps the button from lying about it.
  const isLastAdmin = member.role === "admin" && adminCount <= 1;
  const gone = Boolean(member.deletedAt);

  return (
    <article className="card admin-row">
      <div className="row wrap between">
        <div className="row">
          <Avatar name={member.displayName} src={member.avatarUrl} size={30} />
          <span>
            <Link className="admin-row-name" href={`/u/${member.id}`}>
              {member.displayName}
            </Link>
            <span className="meta" style={{ display: "block" }}>
              {member.email}
            </span>
          </span>
        </div>
        <div className="row wrap">
          <StatusBadge status={member.verificationStatus} />
          {member.role === "admin" && <span className="badge badge-supporter">admin</span>}
          {member.isSupporter && <span className="badge badge-supporter">supporter</span>}
          {member.bannedAt && <span className="badge badge-rejected">banned</span>}
          {gone && <span className="badge badge-unverified">deleted</span>}
        </div>
      </div>

      <p className="meta" style={{ marginTop: "0.4rem" }}>
        Joined {formatDate(member.createdAt, dateFormat)} · {member.threadCount} threads ·{" "}
        {member.replyCount} replies
        {member.openReportCount > 0 && ` · ${member.openReportCount} open reports`}
        {member.bannedAt && ` · banned ${formatDate(member.bannedAt, dateFormat)}`}
      </p>

      {!gone && (
        <div className="admin-actions">
          {member.bannedAt ? (
            <ConfirmAction
              label="Unban"
              title={`Restore ${member.displayName}'s access`}
              description="They can sign in and post again immediately."
              confirmLabel="Unban member"
              reasonRequired={false}
              onConfirm={(reason) => api.post(`/api/users/${member.id}/unban`, { reason }, token)}
              onDone={onChanged}
            />
          ) : (
            <ConfirmAction
              label="Ban"
              title={`Ban ${member.displayName}`}
              description="Takes effect on their current session immediately, not just at next login. Reversible from this same row."
              confirmLabel="Ban member"
              danger
              disabled={member.id === myId}
              onConfirm={(reason) => api.post(`/api/users/${member.id}/ban`, { reason }, token)}
              onDone={onChanged}
            />
          )}

          <ConfirmAction
            label="Warn"
            title={`Warn ${member.displayName}`}
            description="Sends a notification they can't switch off. Nothing is removed."
            confirmLabel="Send warning"
            reasonLabel="Warning (the member reads this, and it's recorded in the log)"
            disabled={member.id === myId}
            onConfirm={(reason) => api.post(`/api/users/${member.id}/warn`, { reason }, token)}
            onDone={onChanged}
          />

          {member.isSupporter ? (
            <ConfirmAction
              label="Revoke supporter"
              title={`Revoke ${member.displayName}'s supporter status`}
              description="They lose supporter-only access. They can still redeem a code again."
              confirmLabel="Revoke supporter"
              danger
              onConfirm={(reason) =>
                api.post(`/api/users/${member.id}/supporter`, { isSupporter: false, reason }, token)
              }
              onDone={onChanged}
            />
          ) : (
            <ConfirmAction
              label="Grant supporter"
              title={`Grant ${member.displayName} supporter status`}
              description="For donations made outside the eventual payment integration."
              confirmLabel="Grant supporter"
              reasonPlaceholder="e.g. cheque received at the November meeting"
              onConfirm={(reason) =>
                api.post(`/api/users/${member.id}/supporter`, { isSupporter: true, reason }, token)
              }
              onDone={onChanged}
            />
          )}

          {member.role === "admin" ? (
            <ConfirmAction
              label={isLastAdmin ? "Demote (last admin)" : "Demote"}
              title={`Demote ${member.displayName} to member`}
              description="They lose access to this dashboard and every moderation endpoint."
              confirmLabel="Demote to member"
              danger
              disabled={isLastAdmin}
              onConfirm={(reason) =>
                api.post(`/api/users/${member.id}/role`, { role: "user", reason }, token)
              }
              onDone={onChanged}
            />
          ) : (
            <ConfirmAction
              label="Promote to admin"
              title={`Make ${member.displayName} an admin`}
              description="Full moderation powers: ban, delete, pin, and role changes."
              confirmLabel="Promote to admin"
              onConfirm={(reason) =>
                api.post(`/api/users/${member.id}/role`, { role: "admin", reason }, token)
              }
              onDone={onChanged}
            />
          )}
        </div>
      )}
    </article>
  );
}
