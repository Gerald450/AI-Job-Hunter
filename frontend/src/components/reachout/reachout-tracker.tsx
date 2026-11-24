"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { OutreachChecks } from "@/components/reachout/outreach-checks";
import { EmptyState } from "@/components/jobs/empty-state";
import { ErrorState } from "@/components/jobs/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createContact,
  deleteContact,
  fetchContactCompanies,
  fetchContacts,
  updateContact,
} from "@/lib/api";
import {
  adjustReachoutStats,
  applyOutreachUpdate,
  type OutreachPatch,
} from "@/lib/reachout";
import { cn } from "@/lib/utils";
import type {
  ContactListResponse,
  ContactUpdate,
  LinkedInContact,
  ReachoutSort,
  ReachoutStatus,
} from "@/types/reachout";

const PAGE_SIZE = 50;

const STATUS_TABS: { value: ReachoutStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reached_out", label: "Reached out" },
  { value: "awaiting_reply", label: "Awaiting reply" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "responded", label: "Responded" },
];

const SORTS: { value: ReachoutSort; label: string }[] = [
  { value: "importance", label: "DM importance" },
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
];

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

interface InfiniteContacts {
  pages: ContactListResponse[];
  pageParams: number[];
}

export function ReachoutTracker() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ReachoutStatus>("all");
  const [sort, setSort] = useState<ReachoutSort>("importance");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const contactsQuery = useInfiniteQuery({
    queryKey: ["reachout", "contacts", { search, company, status, sort, order }],
    queryFn: ({ pageParam }) =>
      fetchContacts({
        limit: PAGE_SIZE,
        offset: pageParam,
        search,
        company,
        status,
        sort,
        order,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
  });

  const companiesQuery = useQuery({
    queryKey: ["reachout", "companies"],
    queryFn: fetchContactCompanies,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContactUpdate }) =>
      updateContact(id, patch),
    onMutate: async ({ id, patch }) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["reachout", "contacts"] });
      const snapshots = queryClient.getQueriesData<InfiniteContacts>({
        queryKey: ["reachout", "contacts"],
      });
      const flagPatch: OutreachPatch = {};
      if (patch.reached_out !== undefined) flagPatch.reached_out = patch.reached_out;
      if (patch.responded !== undefined) flagPatch.responded = patch.responded;
      if (patch.followed_up !== undefined) flagPatch.followed_up = patch.followed_up;
      const hasFlags = Object.keys(flagPatch).length > 0;

      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: ["reachout", "contacts"] },
        (old) => {
          if (!old?.pages) return old;
          const before = old.pages
            .flatMap((page) => page.contacts)
            .find((contact) => contact.id === id);
          if (!before) return old;
          const previous = applyOutreachUpdate(before, {});
          const nextFlags = hasFlags
            ? applyOutreachUpdate(before, flagPatch)
            : previous;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              stats: hasFlags
                ? adjustReachoutStats(page.stats, previous, nextFlags)
                : page.stats,
              contacts: page.contacts.map((contact) =>
                contact.id === id
                  ? {
                      ...contact,
                      ...nextFlags,
                      notes:
                        patch.notes !== undefined ? patch.notes : contact.notes,
                    }
                  : contact,
              ),
            })),
          };
        },
      );
      return { snapshots };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
      setSaveError(error instanceof Error ? error.message : "Couldn't save that change.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["reachout"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contact: LinkedInContact) => deleteContact(contact.id),
    onMutate: async (contact) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ["reachout", "contacts"] });
      const snapshots = queryClient.getQueriesData<InfiniteContacts>({
        queryKey: ["reachout", "contacts"],
      });
      const flags = applyOutreachUpdate(contact, {});
      const cleared = {
        reached_out: false,
        responded: false,
        followed_up: false,
        followed_up_manual: false,
      };
      queryClient.setQueriesData<InfiniteContacts>(
        { queryKey: ["reachout", "contacts"] },
        (old) => {
          if (!old?.pages) return old;
          const present = old.pages.some((page) =>
            page.contacts.some((item) => item.id === contact.id),
          );
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              total: present ? Math.max(0, page.total - 1) : page.total,
              stats: {
                ...adjustReachoutStats(page.stats, flags, cleared),
                total: Math.max(0, page.stats.total - 1),
              },
              contacts: page.contacts.filter((item) => item.id !== contact.id),
            })),
          };
        },
      );
      setExpandedId((current) => (current === contact.id ? null : current));
      return { snapshots };
    },
    onError: (error, _contact, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
      setSaveError(
        error instanceof Error ? error.message : "Couldn't delete that contact.",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["reachout"] });
    },
  });

  const contacts =
    contactsQuery.data?.pages.flatMap((page) => page.contacts) ?? [];
  const stats = contactsQuery.data?.pages[0]?.stats;
  const companies = companiesQuery.data?.companies ?? [];

  function toggleSort(column: ReachoutSort) {
    if (sort !== column) {
      setSort(column);
      setOrder(column === "importance" ? "desc" : "asc");
      return;
    }
    setOrder((current) => (current === "asc" ? "desc" : "asc"));
  }

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  function patchContact(contact: LinkedInContact, patch: OutreachPatch) {
    updateMutation.mutate({ id: contact.id, patch });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="reachout-tracker">
      <AddContactForm
        onCreated={() => {
          setSearch("");
          setCompany("");
          setStatus("all");
          setSort("importance");
          setOrder("desc");
        }}
      />

      {stats ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{stats.reached_out}</span>
          {" / "}
          {stats.total} reached out
          {" · "}
          <span className="font-semibold text-slate-900">{stats.responded}</span>
          {" responded · "}
          <span className="font-semibold text-slate-900">
            {stats.needs_follow_up}
          </span>
          {" need follow-up"}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          aria-label="Search contacts"
          placeholder="Search name, company, or role"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={cn(fieldClass, "sm:max-w-xs")}
        />
        <select
          aria-label="Company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className={cn(fieldClass, "sm:w-auto sm:max-w-xs")}
        >
          <option value="">All companies</option>
          {companies.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <TabBar
        ariaLabel="Outreach status"
        tabs={STATUS_TABS}
        value={status}
        onChange={setStatus}
      />

      <div className="flex flex-wrap gap-2 sm:hidden" aria-label="Sort contacts">
        {SORTS.map((item) => (
          <SortButton
            key={item.value}
            label={item.label}
            active={sort === item.value}
            order={order}
            onClick={() => toggleSort(item.value)}
          />
        ))}
      </div>

      {saveError ? (
        <p className="text-sm text-red-600" role="alert">
          {saveError}
        </p>
      ) : null}

      {contactsQuery.isError ? (
        <ErrorState
          message="Unable to load LinkedIn contacts. Try again."
          onRetry={() => {
            void contactsQuery.refetch();
          }}
        />
      ) : contactsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          message={
            stats && stats.total === 0
              ? "No LinkedIn contacts yet."
              : "No contacts match these filters."
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="w-[18%] px-3 py-3 align-bottom" aria-sort={ariaSort("name", sort, order)}>
                    <SortButton
                      label="Name"
                      active={sort === "name"}
                      order={order}
                      onClick={() => toggleSort("name")}
                    />
                  </th>
                  <th className="w-[16%] px-3 py-3 align-bottom" aria-sort={ariaSort("company", sort, order)}>
                    <SortButton
                      label="Company"
                      active={sort === "company"}
                      order={order}
                      onClick={() => toggleSort("company")}
                    />
                  </th>
                  <th className="w-[24%] px-3 py-3 align-bottom text-xs font-medium">Role</th>
                  <th className="w-[14%] px-2 py-3 align-bottom" aria-sort={ariaSort("importance", sort, order)}>
                    <SortButton
                      label="DM importance"
                      active={sort === "importance"}
                      order={order}
                      onClick={() => toggleSort("importance")}
                    />
                  </th>
                  <th className="w-[9%] px-2 py-3 align-bottom text-xs font-medium leading-tight">
                    Reached out
                  </th>
                  <th className="w-[9%] px-2 py-3 align-bottom text-xs font-medium leading-tight">
                    Responded
                  </th>
                  <th className="w-[10%] px-2 py-3 align-bottom text-xs font-medium leading-tight">
                    Followed up
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const open = expandedId === contact.id;
                  return (
                    <ContactRows
                      key={contact.id}
                      contact={contact}
                      open={open}
                      onToggle={() => toggleExpanded(contact.id)}
                      onPatch={(patch) => patchContact(contact, patch)}
                      onSaveNotes={(notes) =>
                        updateMutation.mutate({ id: contact.id, patch: { notes } })
                      }
                      onDelete={() => deleteMutation.mutate(contact)}
                      deleting={
                        deleteMutation.isPending &&
                        deleteMutation.variables?.id === contact.id
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:hidden">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                open={expandedId === contact.id}
                onToggle={() => toggleExpanded(contact.id)}
                onPatch={(patch) => patchContact(contact, patch)}
                onSaveNotes={(notes) =>
                  updateMutation.mutate({ id: contact.id, patch: { notes } })
                }
                onDelete={() => deleteMutation.mutate(contact)}
                deleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables?.id === contact.id
                }
              />
            ))}
          </div>

          {contactsQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void contactsQuery.fetchNextPage();
              }}
            >
              Load More
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ariaSort(
  column: ReachoutSort,
  sort: ReachoutSort,
  order: "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (sort !== column) return "none";
  return order === "asc" ? "ascending" : "descending";
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-left text-xs font-medium leading-tight",
        active ? "text-blue-700" : "text-slate-500 hover:text-slate-900",
      )}
    >
      {label}
      {active ? <span aria-hidden>{order === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  );
}

function ContactRows({
  contact,
  open,
  onToggle,
  onPatch,
  onSaveNotes,
  onDelete,
  deleting,
}: {
  contact: LinkedInContact;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: OutreachPatch) => void;
  onSaveNotes: (notes: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
        onClick={onToggle}
      >
        <td className="px-3 py-3 align-middle">
          <div className="flex items-start gap-1.5">
            <DetailsButton name={contact.name} open={open} onToggle={onToggle} />
            <span className="min-w-0 break-words font-medium text-slate-900">
              {contact.name}
            </span>
          </div>
        </td>
        <td className="px-3 py-3 align-middle break-words text-slate-700">
          {contact.company}
        </td>
        <td className="px-3 py-3 align-middle text-slate-600" title={contact.role}>
          <span className="line-clamp-2 break-words">{contact.role}</span>
        </td>
        <td className="px-2 py-3 align-middle">
          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {contact.importance}%
          </span>
        </td>
        <OutreachChecks
          name={contact.name}
          flags={contact}
          showLabels={false}
          variant="cells"
          onPatch={onPatch}
        />
      </tr>
      {open ? (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={7} className="px-4 py-4">
            <ContactDetail
              contact={contact}
              onSaveNotes={onSaveNotes}
              onDelete={onDelete}
              deleting={deleting}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ContactCard({
  contact,
  open,
  onToggle,
  onPatch,
  onSaveNotes,
  onDelete,
  deleting,
}: {
  contact: LinkedInContact;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: OutreachPatch) => void;
  onSaveNotes: (notes: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <Card
      className="cursor-pointer gap-3 border border-slate-200 bg-white p-4 shadow-sm ring-0"
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <DetailsButton name={contact.name} open={open} onToggle={onToggle} />
            <h3 className="break-words font-medium text-slate-900">{contact.name}</h3>
          </div>
          <p className="mt-1 break-words text-sm text-slate-700">{contact.company}</p>
          <p className="mt-1 break-words text-sm text-slate-600">{contact.role}</p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
          {contact.importance}%
        </span>
      </div>
      <OutreachChecks
        name={contact.name}
        flags={contact}
        showLabels
        onPatch={onPatch}
      />
      {open ? (
        <div className="border-t border-slate-100 pt-3">
          <ContactDetail
            contact={contact}
            onSaveNotes={onSaveNotes}
            onDelete={onDelete}
            deleting={deleting}
          />
        </div>
      ) : null}
    </Card>
  );
}

function DetailsButton({
  name,
  open,
  onToggle,
}: {
  name: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} details for ${name}`}
      className="mt-0.5 shrink-0 rounded-md p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <ChevronDown
        className={cn("size-4 transition-transform", open && "rotate-180")}
        aria-hidden
      />
    </button>
  );
}

function ContactDetail({
  contact,
  onSaveNotes,
  onDelete,
  deleting,
}: {
  contact: LinkedInContact;
  onSaveNotes: (notes: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [draft, setDraft] = useState(contact.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const lastSent = useRef(contact.notes ?? "");

  useEffect(() => {
    const next = contact.notes ?? "";
    setDraft(next);
    lastSent.current = next;
  }, [contact.notes]);

  function save() {
    if (draft === lastSent.current) return;
    lastSent.current = draft;
    onSaveNotes(draft);
  }

  return (
    <div className="space-y-3" onClick={(event) => event.stopPropagation()}>
      <p className="text-sm leading-relaxed text-slate-700">
        <span className="font-medium text-slate-900">Why this contact: </span>
        {contact.why}
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-900">Personal notes</span>
        <textarea
          value={draft}
          rows={3}
          aria-label={`Personal notes for ${contact.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          className={fieldClass}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={save}>
          Save notes
        </Button>
        {confirmingDelete ? (
          <>
            <span className="text-sm text-slate-600">
              Remove {contact.name} from the list?
            </span>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function AddContactForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [why, setWhy] = useState("");
  const [importance, setImportance] = useState("70");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createContact,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reachout"] });
      setName("");
      setCompany("");
      setRole("");
      setWhy("");
      setImportance("70");
      setError(null);
      setOpen(false);
      onCreated();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(importance);
    if (!name.trim() || !company.trim() || !role.trim()) {
      setError("Name, company, and role are required.");
      return;
    }
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      setError("Importance must be a whole number from 0 to 100.");
      return;
    }
    setError(null);
    mutation.mutate({
      name: name.trim(),
      company: company.trim(),
      role: role.trim(),
      why: why.trim(),
      importance: parsed,
    });
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide add contact" : "Add contact"}
      </Button>
      {open ? (
        <Card className="mt-3 gap-4 border border-slate-200 bg-white p-4 shadow-sm ring-0">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <label className="space-y-1 text-sm font-medium text-slate-900">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={cn(fieldClass, "font-normal")}
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-900">
              Company
              <input
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                className={cn(fieldClass, "font-normal")}
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-900 sm:col-span-2">
              Role
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={cn(fieldClass, "font-normal")}
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-900">
              DM importance
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={importance}
                onChange={(event) => setImportance(event.target.value)}
                className={cn(fieldClass, "font-normal")}
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-900 sm:col-span-2">
              Why
              <textarea
                value={why}
                rows={2}
                onChange={(event) => setWhy(event.target.value)}
                className={cn(fieldClass, "font-normal")}
              />
            </label>
            {error ? (
              <p className="text-sm font-normal text-red-600 sm:col-span-2" role="alert">
                {error}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {mutation.isPending ? "Saving…" : "Save contact"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
