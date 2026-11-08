"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, HardDrive, LogOut, Monitor } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { clearLocalData } from "@/lib/local-data";
import { markLeaving } from "@/lib/query-provider";
import { setLoaded } from "@/lib/loaded-data";
import {
  keys,
  useAccountSummary,
  useProviders,
  type AccountSummary,
} from "@/lib/queries";

/** Better Auth answers with { data, error } instead of throwing: turn an error into one, so mutations can report it. */
function unwrap<T>(result: {
  data: T | null;
  error: { message?: string } | null;
}): T {
  if (result.error)
    throw new Error(result.error.message || "Something went wrong.");
  return result.data as T;
}

const Notice = ({
  children,
  tone = "ok",
}: {
  children: React.ReactNode;
  tone?: "ok" | "error";
}) => (
  <Alert variant={tone === "error" ? "destructive" : "default"}>
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

function Bar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const full = used >= max;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span
          className={
            full ? "font-medium text-brand-text-strong" : "text-muted-foreground"
          }
        >
          {used} of {max}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
      >
        <div
          className={full ? "h-full bg-brand" : "h-full bg-primary"}
          style={{
            width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

export function PlanSection() {
  const { data, isPending } = useAccountSummary();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Your plan
          {data && <Badge variant="secondary">{data.plan}</Badge>}
        </CardTitle>
        <CardDescription>
          What you are using right now. Pilot requests reset on a rolling 24
          hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4" data-testid="plan-usage">
        {isPending || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Bar
              label="Projects"
              used={data.usage.projects.used}
              max={data.usage.projects.max}
            />
            <Bar
              label="Published links"
              used={data.usage.publishedLinks.used}
              max={data.usage.publishedLinks.max}
            />
            <Bar
              label="Pilot requests today"
              used={data.usage.pilotToday.used}
              max={data.usage.pilotToday.max}
            />
            {data.memberSince && (
              <p className="text-sm text-muted-foreground">
                Member since{" "}
                {new Date(data.memberSince).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                .
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfileSection() {
  const { data: session } = authClient.useSession();
  const { data: providers } = useProviders();
  const client = useQueryClient();
  const rename = useMutation({
    mutationFn: async (name: string) =>
      unwrap(await authClient.updateUser({ name })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.summary }),
  });
  const changeEmail = useMutation({
    mutationFn: async (newEmail: string) =>
      unwrap(
        await authClient.changeEmail({ newEmail, callbackURL: "/app/account" }),
      ),
  });
  if (!session) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          The name is shown to you only. Published links never include it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = String(
              new FormData(e.currentTarget).get("name"),
            ).trim();
            if (name) rename.mutate(name);
          }}
        >
          <Field
            id="name"
            label="Name"
            defaultValue={session.user.name}
            maxLength={80}
            required
          />
          {rename.isSuccess && <Notice>Saved.</Notice>}
          {rename.error && <Notice tone="error">{rename.error.message}</Notice>}
          <div>
            <Button type="submit" disabled={rename.isPending}>
              Save name
            </Button>
          </div>
        </form>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Email</Label>
            <p
              className="text-sm text-muted-foreground"
              data-testid="current-email"
            >
              {session.user.email}
            </p>
          </div>
          {providers?.email ? (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                changeEmail.mutate(
                  String(new FormData(e.currentTarget).get("newEmail")).trim(),
                );
              }}
            >
              <Field
                id="newEmail"
                label="New email"
                type="email"
                autoComplete="email"
                required
              />
              {changeEmail.isSuccess && (
                <Notice>
                  Check the inbox of your current address and follow the link to
                  confirm. We will then send a link to the new address.
                </Notice>
              )}
              {changeEmail.error && (
                <Notice tone="error">{changeEmail.error.message}</Notice>
              )}
              <div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={changeEmail.isPending}
                >
                  Change email
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Changing the email needs email sending, which is not set up here
              yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PasswordSection({
  summary,
}: {
  summary: AccountSummary | undefined;
}) {
  const change = useMutation({
    mutationFn: async (v: { currentPassword: string; newPassword: string }) =>
      unwrap(
        await authClient.changePassword({ ...v, revokeOtherSessions: true }),
      ),
  });
  const [mismatch, setMismatch] = useState(false);
  if (!summary) return null;

  if (!summary.signInMethods.includes("credential")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            You sign in with Google, so there is no password on this account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Changing it signs you out of your other devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-sm gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const newPassword = String(f.get("newPassword"));
            if (newPassword !== String(f.get("confirmPassword")))
              return setMismatch(true);
            setMismatch(false);
            change.mutate(
              {
                currentPassword: String(f.get("currentPassword")),
                newPassword,
              },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <Field
            id="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Field
            id="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Field
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {mismatch && (
            <Notice tone="error">The two new passwords do not match.</Notice>
          )}
          {change.isSuccess && <Notice>Password changed.</Notice>}
          {change.error && <Notice tone="error">{change.error.message}</Notice>}
          <div>
            <Button type="submit" disabled={change.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A short, human label for a browser, from its user agent. */
function deviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} on ${system}` : browser;
}

export function SessionsSection() {
  const client = useQueryClient();
  const { data: current } = authClient.useSession();
  const sessions = useQuery({
    queryKey: keys.sessions,
    queryFn: async () => unwrap(await authClient.listSessions()),
  });
  const signOutOthers = useMutation({
    mutationFn: async () => unwrap(await authClient.revokeOtherSessions()),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.sessions }),
  });
  const list = sessions.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where you are signed in</CardTitle>
        <CardDescription>
          If you do not recognise one, change your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid gap-2" data-testid="sessions">
          {list.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <Monitor className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {deviceLabel(s.userAgent)}
              </span>
              {s.token === current?.session.token && (
                <Badge variant="secondary">This device</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Active{" "}
                {new Date(s.updatedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
        {signOutOthers.error && (
          <Notice tone="error">{signOutOthers.error.message}</Notice>
        )}
        {list.length > 1 && (
          <div>
            <Button
              variant="outline"
              onClick={() => signOutOthers.mutate()}
              disabled={signOutOthers.isPending}
            >
              <LogOut /> Sign out of other devices
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DataSection({ userId }: { userId: string }) {
  const [cleared, setCleared] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>
          Your spreadsheet rows are never stored on our servers. This is
          everything else we hold about you.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            render={<a href="/api/me/export" download />}
            nativeButton={false}
          >
            <Download /> Download my data
          </Button>
          <span className="text-sm text-muted-foreground">
            Your profile, projects, published links and Pilot usage, as one
            file.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              setLoaded(null);
              await clearLocalData(userId);
              setCleared(true);
            }}
          >
            <HardDrive /> Remove saved copies from this device
          </Button>
          <span className="text-sm text-muted-foreground">
            Projects will ask for their file again.
          </span>
        </div>
        {cleared && <Notice>Removed from this device.</Notice>}
      </CardContent>
    </Card>
  );
}

export function DeleteSection({
  summary,
  email,
}: {
  summary: AccountSummary | undefined;
  email: string;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const usesPassword = summary?.signInMethods.includes("credential") ?? true;
  const remove = useMutation({
    mutationFn: async (password: string | undefined) =>
      unwrap(await authClient.deleteUser(password ? { password } : {})),
    onSuccess: async () => {
      // the account is gone, so any request still in flight would come back 401: stand down the sign-in redirect, drop
      // the cached answers, and leave
      markLeaving();
      client.clear();
      setLoaded(null);
      await clearLocalData();
      window.location.assign("/");
    },
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Removes your projects, published links, Pilot history and sign-in for
          good. Links you shared stop working. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) remove.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              {usesPassword
                ? "Enter your password to confirm."
                : `Type ${email} to confirm.`}{" "}
              Everything under this account is removed straight away.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(
                new FormData(e.currentTarget).get("deleteConfirm"),
              );
              if (
                !usesPassword &&
                value.trim().toLowerCase() !== email.toLowerCase()
              )
                return;
              remove.mutate(usesPassword ? value : undefined);
            }}
          >
            {usesPassword ? (
              <Field
                id="deleteConfirm"
                label="Password"
                type="password"
                autoComplete="current-password"
                required
              />
            ) : (
              <Field
                id="deleteConfirm"
                label="Your email"
                type="email"
                autoComplete="off"
                required
              />
            )}
            {remove.error && (
              <Notice tone="error">{remove.error.message}</Notice>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Keep my account
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={remove.isPending}
              >
                {remove.isPending ? "Deleting…" : "Delete everything"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
