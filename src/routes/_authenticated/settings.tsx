/**
 * ServiceHub Administrator Settings (Milestone 1.2.7).
 * Owner/admin only. Four tabs: N3 Integration, Renewal, Ad Hoc, General.
 */

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listAdminTenants, getSyncStatus, triggerSync } from "@/lib/sync.functions";
import type { SyncStatusReport } from "@/lib/sync.functions";
import {
  getTenantMeta,
  testN3Connection,
  listStockOptions,
  listRenewalMapping,
  upsertRenewalMapping,
  setRenewalMappingActive,
  listAdhocMapping,
  upsertAdhocMapping,
  setAdhocMappingActive,
  getGeneralSettings,
  updateGeneralSettings,
  type TenantMeta,
  type StockOption,
  type RenewalMappingRow,
  type AdhocMappingRow,
  type GeneralSettings,
} from "@/lib/settings.functions";
import {
  listApprovalRules,
  updateApprovalRule,
  listAccessPermissions,
  updateAccessPermission,
  listReportAccess,
  updateReportAccess,
  type ApprovalRuleRow,
  type CustomerStatus,
  type InitialJobStatus,
  type PermissionRow,
  type ProfileCode,
  type ReportAccessRow,
  type ReportAccessField,
} from "@/lib/access-settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold">Settings error</h1>
        <p className="mt-2 text-sm text-destructive">{error.message}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">Settings not found.</div>,
});

function useTenants() {
  const list = useServerFn(listAdminTenants);
  const [tenants, setTenants] = useState<Array<{ tenantId: string; name: string }>>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    list()
      .then((rows) => {
        setTenants(rows.map((r) => ({ tenantId: r.tenantId, name: r.name })));
        if (rows.length > 0) setTenantId(rows[0].tenantId);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [list]);
  return { tenants, tenantId, setTenantId, err };
}

function SettingsPage() {
  const { tenants, tenantId, setTenantId, err } = useTenants();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Administrator configuration for ServiceHub. Owner or Administrator role required.
          </p>
        </div>
        {tenants.length > 1 && (
          <Select value={tenantId ?? ""} onValueChange={(v) => setTenantId(v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((t) => (
                <SelectItem key={t.tenantId} value={t.tenantId}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {err && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {!tenantId && !err && (
        <p className="text-sm text-muted-foreground">
          You are not an owner/administrator of any tenant.
        </p>
      )}

      {tenantId && (
        <Tabs defaultValue="n3" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="n3">N3 Integration</TabsTrigger>
            <TabsTrigger value="renewal">Renewal Settings</TabsTrigger>
            <TabsTrigger value="adhoc">Ad Hoc Service</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="approval">Approval Rules</TabsTrigger>
            <TabsTrigger value="profiles">Access Profiles</TabsTrigger>
            <TabsTrigger value="reports">Report Access</TabsTrigger>
          </TabsList>
          <TabsContent value="n3" className="mt-4">
            <N3Tab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="renewal" className="mt-4">
            <RenewalTab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="adhoc" className="mt-4">
            <AdhocTab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="general" className="mt-4">
            <GeneralTab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="approval" className="mt-4">
            <ApprovalRulesTab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="profiles" className="mt-4">
            <AccessProfilesTab tenantId={tenantId} />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <ReportAccessTab tenantId={tenantId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// -------------- Tab 1: N3 Integration --------------

function N3Tab({ tenantId }: { tenantId: string }) {
  const getMeta = useServerFn(getTenantMeta);
  const getStatus = useServerFn(getSyncStatus);
  const runSync = useServerFn(triggerSync);
  const testConn = useServerFn(testN3Connection);

  const [meta, setMeta] = useState<TenantMeta | null>(null);
  const [status, setStatus] = useState<SyncStatusReport | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    Promise.all([
      getMeta({ data: { tenantId } }),
      getStatus({ data: { tenantId } }),
    ])
      .then(([m, s]) => {
        setMeta(m);
        setStatus(s);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    status?.entities.forEach((e) => m.set(e.entity, e.recordCount));
    return m;
  }, [status]);

  const lastSync = useMemo(() => {
    const arr = (status?.entities ?? [])
      .map((e) => e.lastSuccessfulAt)
      .filter((v): v is string => !!v)
      .map((v) => new Date(v).getTime());
    if (arr.length === 0) return null;
    return new Date(Math.max(...arr)).toLocaleString();
  }, [status]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>N3 Connection</CardTitle>
          <CardDescription>API key itself is never displayed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Company Name" value={meta?.n3CompanyName ?? meta?.name ?? "—"} />
          <Row label="Tenant Code" value={meta?.n3TenantCode ?? "—"} />
          <Row label="API Key Reference" value={meta?.n3ApiKeyRef ?? "—"} mono />
          <Row label="Last Successful Sync" value={lastSync ?? "—"} />
          <div className="flex flex-wrap gap-2 pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setTestResult(null);
                try {
                  const r = await testConn({ data: { tenantId } });
                  setTestResult(
                    r.ok
                      ? `OK — ${r.company ?? ""} ${r.tenantCode ? `(${r.tenantCode})` : ""}`
                      : `Failed — ${r.error}`,
                  );
                } catch (e) {
                  setTestResult(`Failed — ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? "Testing…" : "Test Connection"}
            </Button>
            <Button
              size="sm"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await runSync({ data: { tenantId } });
                  load();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? "Syncing…" : "Sync All Now"}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/sync">View Sync History</Link>
            </Button>
          </div>
          {testResult && (
            <p className="pt-2 text-xs text-muted-foreground">{testResult}</p>
          )}
          {err && <p className="pt-2 text-xs text-destructive">{err}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record Counts</CardTitle>
          <CardDescription>Live counts from synced N3 tables.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <CountRow label="Customers" v={counts.get("customers") ?? 0} />
            <CountRow label="Stock" v={counts.get("stock") ?? 0} />
            <CountRow label="Invoices" v={counts.get("sales_invoices") ?? 0} />
            <CountRow label="Delivery Orders" v={counts.get("delivery_orders") ?? 0} />
            <CountRow label="Users" v={counts.get("users") ?? 0} />
            <CountRow label="Roles" v={counts.get("roles") ?? 0} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

function CountRow({ label, v }: { label: string; v: number }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{v.toLocaleString()}</dd>
    </>
  );
}

// -------------- Stock combobox --------------

function StockPicker({
  tenantId,
  value,
  onChange,
  disabled,
}: {
  tenantId: string;
  value: string;
  onChange: (code: string, description: string | null) => void;
  disabled?: boolean;
}) {
  const list = useServerFn(listStockOptions);
  const [options, setOptions] = useState<StockOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    list({ data: { tenantId } })
      .then(setOptions)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [tenantId, list]);
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (options.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No synced N3 stock. Run <Link to="/admin/sync" className="underline">Sync</Link> first.
      </p>
    );
  return (
    <Select value={value} onValueChange={(v) => {
      const o = options.find((o) => o.code === v);
      onChange(v, o?.description ?? null);
    }} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder="Select stock code" /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.code} value={o.code}>
            <span className="font-mono">{o.code}</span>
            {o.description ? <span className="ml-2 text-muted-foreground">— {o.description}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// -------------- Tab 2: Renewal --------------

function RenewalTab({ tenantId }: { tenantId: string }) {
  const listFn = useServerFn(listRenewalMapping);
  const upsert = useServerFn(upsertRenewalMapping);
  const setActive = useServerFn(setRenewalMappingActive);
  const getSettings = useServerFn(getGeneralSettings);
  const updateSettings = useServerFn(updateGeneralSettings);

  const [rows, setRows] = useState<RenewalMappingRow[]>([]);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [editing, setEditing] = useState<RenewalMappingRow | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    Promise.all([listFn({ data: { tenantId } }), getSettings({ data: { tenantId } })])
      .then(([r, s]) => {
        setRows(r);
        setSettings(s);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(reload, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing({
      id: "",
      stockCode: "",
      description: "",
      contractDays: 365,
      serviceType: "contract",
      isActive: true,
    });
    setOpen(true);
  };
  const openEdit = (r: RenewalMappingRow) => {
    setEditing({ ...r });
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.stockCode) {
      setErr("Stock code is required");
      return;
    }
    try {
      await upsert({
        data: {
          tenantId,
          id: editing.id || undefined,
          stockCode: editing.stockCode,
          description: editing.description,
          contractDays: editing.contractDays,
          serviceType: editing.serviceType || "contract",
          isActive: editing.isActive,
        },
      });
      setOpen(false);
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Default Due Soon</CardTitle>
            <CardDescription>
              Renewal engine will highlight contracts within this window before expiry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={String(settings.dueSoonDays)}
              onValueChange={async (v) => {
                const n = Number(v) as GeneralSettings["dueSoonDays"];
                await updateSettings({ data: { tenantId, dueSoonDays: n } });
                setSettings({ ...settings, dueSoonDays: n });
              }}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 45, 60, 90].map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Renewal Stock Codes</CardTitle>
            <CardDescription>
              Only stock codes listed here are treated as renewal contracts.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd}>Add renewal code</Button>
        </CardHeader>
        <CardContent>
          {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-32">Contract Days</TableHead>
                <TableHead className="w-32">Service Type</TableHead>
                <TableHead className="w-24">Active</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No renewal stock codes configured yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.stockCode}</TableCell>
                  <TableCell>{r.description ?? "—"}</TableCell>
                  <TableCell>{r.contractDays}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.serviceType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.isActive}
                      onCheckedChange={async (v) => {
                        await setActive({ data: { tenantId, id: r.id, isActive: v } });
                        reload();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit renewal code" : "Add renewal code"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Stock Code</Label>
                {editing.id ? (
                  <Input value={editing.stockCode} disabled className="font-mono" />
                ) : (
                  <StockPicker
                    tenantId={tenantId}
                    value={editing.stockCode}
                    onChange={(code, desc) =>
                      setEditing({ ...editing, stockCode: code, description: desc })
                    }
                  />
                )}
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contract Days</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.contractDays}
                    onChange={(e) =>
                      setEditing({ ...editing, contractDays: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label>Service Type</Label>
                  <Input
                    value={editing.serviceType}
                    onChange={(e) => setEditing({ ...editing, serviceType: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editing.isActive}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------- Tab 3: Ad Hoc --------------

function AdhocTab({ tenantId }: { tenantId: string }) {
  const listFn = useServerFn(listAdhocMapping);
  const upsert = useServerFn(upsertAdhocMapping);
  const setActive = useServerFn(setAdhocMappingActive);
  const [rows, setRows] = useState<AdhocMappingRow[]>([]);
  const [editing, setEditing] = useState<AdhocMappingRow | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    listFn({ data: { tenantId } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(reload, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing({ id: "", stockCode: "", description: "", serviceType: "ad_hoc", isActive: true });
    setOpen(true);
  };
  const openEdit = (r: AdhocMappingRow) => {
    setEditing({ ...r });
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.stockCode) {
      setErr("Stock code is required");
      return;
    }
    try {
      await upsert({
        data: {
          tenantId,
          id: editing.id || undefined,
          stockCode: editing.stockCode,
          description: editing.description,
          serviceType: editing.serviceType || "ad_hoc",
          isActive: editing.isActive,
        },
      });
      setOpen(false);
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Ad Hoc Service Codes</CardTitle>
          <CardDescription>
            Non-renewal services (installation, training, on-site support, etc.).
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>Add ad hoc code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Edit ad hoc code" : "Add ad hoc code"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div>
                  <Label>Stock Code</Label>
                  {editing.id ? (
                    <Input value={editing.stockCode} disabled className="font-mono" />
                  ) : (
                    <StockPicker
                      tenantId={tenantId}
                      value={editing.stockCode}
                      onChange={(code, desc) =>
                        setEditing({ ...editing, stockCode: code, description: desc })
                      }
                    />
                  )}
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Service Type</Label>
                  <Input
                    value={editing.serviceType}
                    onChange={(e) => setEditing({ ...editing, serviceType: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editing.isActive}
                    onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stock Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-32">Service Type</TableHead>
              <TableHead className="w-24">Active</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No ad hoc codes configured yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.stockCode}</TableCell>
                <TableCell>{r.description ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{r.serviceType}</Badge></TableCell>
                <TableCell>
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={async (v) => {
                      await setActive({ data: { tenantId, id: r.id, isActive: v } });
                      reload();
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// -------------- Tab 4: General --------------

function GeneralTab({ tenantId }: { tenantId: string }) {
  const getSettings = useServerFn(getGeneralSettings);
  const update = useServerFn(updateGeneralSettings);
  const [s, setS] = useState<GeneralSettings | null>(null);
  const [prefix, setPrefix] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    getSettings({ data: { tenantId } })
      .then((r) => {
        setS(r);
        setPrefix(r.jobPrefix);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [tenantId, getSettings]);

  const preview = useMemo(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${prefix || "JB"}${yy}${mm}${dd}01`;
  }, [prefix]);

  const savePrefix = async () => {
    try {
      setErr(null);
      await update({ data: { tenantId, jobPrefix: prefix } });
      setSaved("Job prefix saved.");
      setTimeout(() => setSaved(null), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Job Number Format</CardTitle>
          <CardDescription>
            Format is <span className="font-mono">{"{prefix}{yy}{mm}{dd}{nn}"}</span>. Only the prefix is configurable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Prefix</Label>
            <Input
              value={prefix}
              maxLength={6}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              className="font-mono w-40"
              placeholder="JB"
            />
            <p className="mt-1 text-xs text-muted-foreground">1–6 letters or digits.</p>
          </div>
          <div>
            <Label>Preview</Label>
            <p className="font-mono text-lg">{preview}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={savePrefix}>Save prefix</Button>
            {saved && <span className="text-xs text-muted-foreground">{saved}</span>}
            {err && <span className="text-xs text-destructive">{err}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification</CardTitle>
          <CardDescription>Top-of-page notifications for the tenant.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            checked={s.notificationEnabled}
            onCheckedChange={async (v) => {
              await update({ data: { tenantId, notificationEnabled: v } });
              setS({ ...s, notificationEnabled: v });
            }}
          />
          <Label>{s.notificationEnabled ? "Enabled" : "Disabled"}</Label>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Job Assignment</CardTitle>
          <CardDescription>
            Label shown for the assignee column, and default behaviour when a job is created without a selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Assigned User Label</Label>
            <Input
              value={s.assignedUserLabel}
              maxLength={40}
              onChange={(e) => setS({ ...s, assignedUserLabel: e.target.value })}
              onBlur={async () => {
                await update({ data: { tenantId, assignedUserLabel: s.assignedUserLabel } });
              }}
              placeholder="Engineer / Technician / Support"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used in Jobs list column header and detail labels.
            </p>
          </div>
          <div>
            <Label>Default Assignment Mode</Label>
            <Select
              value={s.jobAssignmentMode}
              onValueChange={async (v) => {
                const mode = v as GeneralSettings["jobAssignmentMode"];
                setS({ ...s, jobAssignmentMode: mode });
                await update({ data: { tenantId, jobAssignmentMode: mode } });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto_assign_creator">Auto-assign to creator</SelectItem>
                <SelectItem value="leave_unassigned">Leave unassigned</SelectItem>
                <SelectItem value="select_each_time">Require selection each time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>

          <CardTitle>Timezone</CardTitle>
          <CardDescription>Server-side timezone for scheduling and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-sm">{s.timezone}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hidden from non-administrators. Change requires database migration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------- Tab 5: Approval Rules --------------

const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  active: "Active",
  due_soon: "Due Soon",
  overdue: "Overdue",
  suspended: "Suspended",
  unknown: "Unknown",
};

function ApprovalRulesTab({ tenantId }: { tenantId: string }) {
  const listFn = useServerFn(listApprovalRules);
  const update = useServerFn(updateApprovalRule);
  const [rows, setRows] = useState<ApprovalRuleRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    listFn({ data: { tenantId } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(reload, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (
    id: string,
    p: { initialJobStatus?: InitialJobStatus; approvalRequired?: boolean; isActive?: boolean },
  ) => {
    try {
      await update({ data: { tenantId, id, ...p } });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval Rules</CardTitle>
        <CardDescription>
          Determines the initial job status and approval requirement based on the customer's
          contract status. Support may always record a request; jobs for Overdue, Suspended, or
          Unknown customers default to Draft and require approval before work proceeds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer Status</TableHead>
              <TableHead className="w-24">Can Create</TableHead>
              <TableHead className="w-40">Initial Job Status</TableHead>
              <TableHead className="w-40">Approval Required</TableHead>
              <TableHead className="w-24">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {CUSTOMER_STATUS_LABEL[r.customerStatus]}
                </TableCell>
                <TableCell>
                  <Badge variant={r.canCreateJob ? "secondary" : "outline"}>
                    {r.canCreateJob ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Select
                    value={r.initialJobStatus}
                    onValueChange={(v) =>
                      patch(r.id, { initialJobStatus: v as InitialJobStatus })
                    }
                  >
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.approvalRequired}
                    onCheckedChange={(v) => patch(r.id, { approvalRequired: v })}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.isActive}
                    onCheckedChange={(v) => patch(r.id, { isActive: v })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// -------------- Tab 6: Access Profiles --------------

const PERMISSION_LABELS: Record<string, string> = {
  view_support_dashboard: "View Support Dashboard",
  view_engineer_dashboard: "View Engineer Dashboard",
  search_customers: "Search Customers",
  view_customer_contract_status: "View Customer Contract Status",
  create_standard_job: "Create Standard Job",
  create_quick_job: "Create Quick Job",
  view_all_jobs: "View All Jobs",
  view_my_jobs: "View My Jobs",
  edit_jobs: "Edit Jobs",
  update_assigned_jobs: "Update Assigned Jobs",
  reassign_engineer: "Reassign Engineer",
  add_job_comments: "Add Job Comments",
  upload_attachments: "Upload Attachments",
  mark_waiting_customer: "Mark Waiting Customer",
  mark_waiting_vendor: "Mark Waiting Vendor",
  complete_job: "Complete Job",
  complete_assigned_job: "Complete Assigned Job",
  cancel_job: "Cancel Job",
  view_calendar: "View Calendar",
  view_reports: "View Authorized Reports",
  print_reports: "Print Authorized Reports",
  export_reports_excel: "Export Authorized Reports to Excel",
  job_approval: "Job Approval",
  settings: "Settings",
  n3_writeback: "N3 Write-back",
  pricing: "Pricing",
};

const ADMIN_PERMISSIONS = [
  "Admin Dashboard",
  "Support Dashboard",
  "Customer Search",
  "All Jobs",
  "Job Approval",
  "Engineer Reassignment",
  "Settings",
  "N3 Integration",
  "Renewal Mapping",
  "Ad Hoc Mapping",
  "Reports",
  "Report Access Configuration",
  "Activity Logs",
  "Sync Verification Console",
];

function AccessProfilesTab({ tenantId }: { tenantId: string }) {
  const listFn = useServerFn(listAccessPermissions);
  const update = useServerFn(updateAccessPermission);
  const [rows, setRows] = useState<PermissionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    listFn({ data: { tenantId } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(reload, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (id: string, isAllowed: boolean) => {
    try {
      await update({ data: { tenantId, id, isAllowed } });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isAllowed } : r)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const forProfile = (p: ProfileCode) =>
    rows
      .filter((r) => r.profileCode === p)
      .sort((a, b) =>
        (PERMISSION_LABELS[a.permissionCode] ?? a.permissionCode).localeCompare(
          PERMISSION_LABELS[b.permissionCode] ?? b.permissionCode,
        ),
      );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Administrator</CardTitle>
          <CardDescription>Fixed profile — always full access.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {ADMIN_PERMISSIONS.map((p) => (
              <li key={p} className="flex items-center justify-between">
                <span>{p}</span>
                <Badge variant="secondary">Always</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {(["support", "engineer"] as ProfileCode[]).map((profile) => (
        <Card key={profile}>
          <CardHeader>
            <CardTitle className="capitalize">{profile}</CardTitle>
            <CardDescription>
              Toggle permissions granted to {profile} users in this tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
            <ul className="space-y-2 text-sm">
              {forProfile(profile).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span>{PERMISSION_LABELS[r.permissionCode] ?? r.permissionCode}</span>
                  <Switch
                    checked={r.isAllowed}
                    onCheckedChange={(v) => toggle(r.id, v)}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -------------- Tab 7: Report Access --------------

function ReportAccessTab({ tenantId }: { tenantId: string }) {
  const listFn = useServerFn(listReportAccess);
  const update = useServerFn(updateReportAccess);
  const [rows, setRows] = useState<ReportAccessRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    listFn({ data: { tenantId } })
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(reload, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = async (id: string, field: ReportAccessField, value: boolean) => {
    try {
      await update({ data: { tenantId, id, field, value } });
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          switch (field) {
            case "visible_to_support": return { ...r, visibleToSupport: value };
            case "visible_to_engineer": return { ...r, visibleToEngineer: value };
            case "allow_print_support": return { ...r, allowPrintSupport: value };
            case "allow_print_engineer": return { ...r, allowPrintEngineer: value };
            case "allow_excel_support": return { ...r, allowExcelSupport: value };
            case "allow_excel_engineer": return { ...r, allowExcelEngineer: value };
            case "is_active": return { ...r, isActive: value };
          }
        }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report Access</CardTitle>
        <CardDescription>
          Administrators always see every report. Choose which reports appear on the Support and
          Engineer dashboards, and whether each role can print or export to Excel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {err && <p className="mb-2 text-sm text-destructive">{err}</p>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report</TableHead>
                <TableHead className="text-center">Support: View</TableHead>
                <TableHead className="text-center">Support: Print</TableHead>
                <TableHead className="text-center">Support: Excel</TableHead>
                <TableHead className="text-center">Engineer: View</TableHead>
                <TableHead className="text-center">Engineer: Print</TableHead>
                <TableHead className="text-center">Engineer: Excel</TableHead>
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.reportName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.reportCode}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.visibleToSupport}
                      onCheckedChange={(v) => set(r.id, "visible_to_support", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.allowPrintSupport} disabled={!r.visibleToSupport}
                      onCheckedChange={(v) => set(r.id, "allow_print_support", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.allowExcelSupport} disabled={!r.visibleToSupport}
                      onCheckedChange={(v) => set(r.id, "allow_excel_support", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.visibleToEngineer}
                      onCheckedChange={(v) => set(r.id, "visible_to_engineer", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.allowPrintEngineer} disabled={!r.visibleToEngineer}
                      onCheckedChange={(v) => set(r.id, "allow_print_engineer", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.allowExcelEngineer} disabled={!r.visibleToEngineer}
                      onCheckedChange={(v) => set(r.id, "allow_excel_engineer", v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={r.isActive}
                      onCheckedChange={(v) => set(r.id, "is_active", v)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
