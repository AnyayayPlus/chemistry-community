import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Heart, MessageSquare, Plus, Pencil, Trash2, LogOut, Download } from "lucide-react";

type Category = "members" | "feedbackers" | "appreciators";
type Entry = {
  id?: number;
  category: Category;
  position: number;
  name: string;
  email: string | null;
  amount_cents: number | null;
  currency: string | null;
  date: string | null;
  message: string | null;
  avatar: string | null;
  title: string | null;
  links: { icon: string; link: string }[];
  visible: boolean;
};
const labels: Record<Category, string> = {
  members: "共建者",
  feedbackers: "反馈者",
  appreciators: "赞助者",
};
const fresh = (category: Category, position: number): Entry => ({
  category,
  position,
  name: "",
  email: "",
  amount_cents: category === "appreciators" ? 0 : null,
  currency: category === "appreciators" ? "CNY" : null,
  date: "",
  message: "",
  avatar: "",
  title: "",
  links: [],
  visible: true,
});
async function api(path: string, options: RequestInit = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "请求失败");
  return body;
}
export default function App() {
  const [authenticated, setAuthenticated] = useState(false),
    [loading, setLoading] = useState(true),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [rows, setRows] = useState<Entry[]>([]),
    [category, setCategory] = useState<Category>("appreciators"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Entry | null>(null),
    [linksText, setLinksText] = useState("");
  const load = async () => {
    try {
      const data = await api("/api/entries");
      setRows(data);
      setAuthenticated(true);
      setError("");
    } catch {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const login = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const edit = (row: Entry) => {
    setEditing({ ...row });
    setLinksText(row.links.map((l) => `${l.icon} ${l.link}`).join("\n"));
    setError("");
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const links = linksText
        .split("\n")
        .filter((x) => x.trim())
        .map((line) => {
          const [icon, link] = line.trim().split(/\s+/);
          return { icon, link };
        });
      await api(editing.id ? `/api/entries/${editing.id}` : "/api/entries", {
        method: editing.id ? "PUT" : "POST",
        body: JSON.stringify({ ...editing, links }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const remove = async (row: Entry) => {
    if (!window.confirm(`确定删除「${row.name}」？`)) return;
    try {
      await api(`/api/entries/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "community-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const field = (key: keyof Entry, value: string | number | boolean) =>
    setEditing((prev) => (prev ? { ...prev, [key]: value } : null));
  if (loading)
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">正在加载…</div>
    );
  if (!authenticated)
    return (
      <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Community 管理后台</CardTitle>
            <CardDescription>登录后管理化学笔记的共建与支持名单。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={login}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">管理员密码</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit">登录</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  const filtered = rows.filter(
    (r) =>
      r.category === category && r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <div className="font-semibold">
              Chemistry Note <span className="text-muted-foreground">/ Community</span>
            </div>
            <p className="text-sm text-muted-foreground">名单管理</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportData}>
              <Download data-icon="inline-start" />
              导出数据
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await api("/api/logout", { method: "POST" });
                setAuthenticated(false);
              }}
            >
              <LogOut data-icon="inline-start" />
              退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10">
        <div>
          <p className="text-sm font-medium text-muted-foreground">COMMUNITY MANAGEMENT</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">共建与支持</h1>
          <p className="mt-2 text-muted-foreground">管理每一份贡献、反馈和支持。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(["members", "feedbackers", "appreciators"] as Category[]).map((c, i) => {
            const Icon = [Users, MessageSquare, Heart][i];
            return (
              <Card key={c}>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Icon className="size-4" />
                    {labels[c]}
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {rows.filter((r) => r.category === c).length}
                  </CardTitle>
                </CardHeader>
              </Card>
            );
          })}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {editing ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {editing.id ? "编辑" : "新增"}
                {labels[editing.category]}
              </CardTitle>
              <CardDescription>保存后，公开接口会立即反映更改。</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="name">名称</FieldLabel>
                    <Input
                      id="name"
                      value={editing.name}
                      onChange={(e) => field("name", e.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="order">排序（数字越小越靠前）</FieldLabel>
                    <Input
                      id="order"
                      type="number"
                      min="0"
                      value={editing.position}
                      onChange={(e) => field("position", Number(e.target.value))}
                    />
                  </Field>
                  {editing.category !== "members" && (
                    <Field>
                      <FieldLabel htmlFor="email">邮箱（仅管理端可见）</FieldLabel>
                      <Input
                        id="email"
                        type="email"
                        value={editing.email || ""}
                        onChange={(e) => field("email", e.target.value)}
                      />
                    </Field>
                  )}
                  {editing.category === "appreciators" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="amount">金额（元）</FieldLabel>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={(editing.amount_cents || 0) / 100}
                          onChange={(e) =>
                            field("amount_cents", Math.round(Number(e.target.value) * 100))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="date">日期</FieldLabel>
                        <Input
                          id="date"
                          type="date"
                          value={editing.date || ""}
                          onChange={(e) => field("date", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="message">留言</FieldLabel>
                        <Textarea
                          id="message"
                          value={editing.message || ""}
                          onChange={(e) => field("message", e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  {editing.category === "members" && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="avatar">头像路径或 HTTPS 地址</FieldLabel>
                        <Input
                          id="avatar"
                          value={editing.avatar || ""}
                          onChange={(e) => field("avatar", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="title">身份</FieldLabel>
                        <Input
                          id="title"
                          value={editing.title || ""}
                          onChange={(e) => field("title", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="links">社交链接（每行：图标 HTTPS地址）</FieldLabel>
                        <Textarea
                          id="links"
                          value={linksText}
                          onChange={(e) => setLinksText(e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  <Field orientation="horizontal">
                    <input
                      id="visible"
                      type="checkbox"
                      checked={editing.visible}
                      onChange={(e) => field("visible", e.target.checked)}
                    />
                    <FieldLabel htmlFor="visible">在公开名单中显示</FieldLabel>
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit">保存</Button>
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      取消
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>名单记录</CardTitle>
                  <CardDescription>维护显示在网站上的社区名单。</CardDescription>
                </div>
                <Button
                  onClick={() =>
                    edit(
                      fresh(
                        category,
                        Math.max(
                          -1,
                          ...rows.filter((r) => r.category === category).map((r) => r.position),
                        ) + 1,
                      ),
                    )
                  }
                >
                  <Plus data-icon="inline-start" />
                  添加{labels[category]}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap justify-between gap-4">
                <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <TabsList>
                    {(["appreciators", "members", "feedbackers"] as Category[]).map((c) => (
                      <TabsTrigger key={c} value={c}>
                        {labels[c]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Input
                  className="max-w-xs"
                  placeholder="搜索名称"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>详情</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.category === "appreciators"
                            ? `${((row.amount_cents || 0) / 100).toFixed(2)} CNY · ${row.date || "未填日期"}`
                            : row.category === "members"
                              ? row.title || "—"
                              : row.email || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.visible ? "default" : "secondary"}>
                            {row.visible ? "公开" : "隐藏"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`编辑 ${row.name}`}
                            onClick={() => edit(row)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`删除 ${row.name}`}
                            onClick={() => void remove(row)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length === 0 && (
                  <p className="py-10 text-center text-muted-foreground">没有找到记录</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
