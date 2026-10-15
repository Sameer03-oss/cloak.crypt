import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import "@clerk/themes/shadcn.css";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileImage,
  FileLock2,
  History,
  ImagePlus,
  Info,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  UnlockKeyhole,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import NotFound from "@/pages/not-found";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

type PayloadKind = "text" | "image";
type ContainerPayload = {
  version: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  kind: PayloadKind;
  mimeType?: string;
  fileName?: string;
};
type VaultItemSummary = {
  id: string;
  name: string;
  kind: PayloadKind;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
};
type VaultItemDetail = VaultItemSummary & { payload: ContainerPayload };
type Theme = "light" | "dark";

const bytesToB64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};
const b64ToBytes = (input: string) =>
  Uint8Array.from(atob(input), (char) => char.charCodeAt(0));

async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptBytes(
  bytes: Uint8Array,
  passphrase: string,
  details: Pick<ContainerPayload, "kind" | "mimeType" | "fileName">,
): Promise<ContainerPayload> {
  if (!passphrase.trim()) throw new Error("Add a passphrase before encrypting.");
  if (!bytes.length) throw new Error("Add content before encrypting.");
  const iterations = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt, iterations);
  const clearBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(clearBuffer).set(bytes);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, clearBuffer),
  );
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(encrypted),
    ...details,
  };
}

async function decryptBytes(payload: ContainerPayload, passphrase: string) {
  if (!passphrase.trim()) throw new Error("Add the passphrase that protects this item.");
  const key = await deriveVaultKey(
    passphrase,
    b64ToBytes(payload.salt),
    payload.iterations,
  );
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
    key,
    b64ToBytes(payload.ciphertext),
  );
  return new Uint8Array(clear);
}

function containerHtml(payload: ContainerPayload) {
  const safe = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CLOAK CRYPT encrypted container</title><meta name="cloak-crypt-container" content="AES-256-GCM"><style>body{font-family:system-ui,sans-serif;background:#f5f1e8;color:#1b2c38;padding:12vw;line-height:1.6}main{max-width:580px;margin:auto;border:1px solid #ccd2d2;border-radius:16px;padding:32px;background:#fffdf8}code{font-family:monospace;color:#176c68}</style></head><body><main><p><strong>CLOAK CRYPT</strong> / encrypted container</p><h1>Your content is sealed.</h1><p>This portable HTML file contains ciphertext only. Open it in CLOAK CRYPT to decrypt locally with your passphrase.</p><p><code>AES-256-GCM · PBKDF2-SHA-256</code></p><script type="application/json" id="cloak-crypt-payload">${safe}</script></main></body></html>`;
}

function extractPayload(html: string): ContainerPayload {
  const match = html.match(
    /<script type="application\/json" id="(?:cloak-crypt|vaultline)-payload">([\s\S]*?)<\/script>/i,
  );
  if (!match) throw new Error("That file is not a CLOAK CRYPT container.");
  const payload = JSON.parse(match[1]) as Partial<ContainerPayload>;
  if (
    payload.algorithm !== "AES-256-GCM" ||
    payload.kdf !== "PBKDF2-SHA-256" ||
    !payload.ciphertext ||
    (payload.kind !== "text" && payload.kind !== "image")
  ) {
    throw new Error("The encrypted container is invalid.");
  }
  return payload as ContainerPayload;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || "The request could not be completed.");
  }
  return body as T;
}

function getPasswordStrength(passphrase: string) {
  if (!passphrase) return { label: "Not strong", level: 0 };
  let score = 0;
  if (passphrase.length >= 8) score += 1;
  if (passphrase.length >= 14) score += 1;
  if (/[a-z]/.test(passphrase)) score += 1;
  if (/[A-Z]/.test(passphrase)) score += 1;
  if (/\d/.test(passphrase)) score += 1;
  if (/[^A-Za-z0-9]/.test(passphrase)) score += 1;
  return score >= 6
    ? { label: "Very strong", level: 3 }
    : score >= 4
      ? { label: "Strong", level: 2 }
      : { label: "Not strong", level: 1 };
}

function PasswordStrength({ passphrase }: { passphrase: string }) {
  const strength = getPasswordStrength(passphrase);
  return (
    <div className={`vl-password-strength level-${strength.level}`} aria-live="polite">
      <span className="vl-strength-bars">
        {[1, 2, 3].map((bar) => (
          <i key={bar} className={bar <= strength.level ? "filled" : ""} />
        ))}
      </span>
      <span>{strength.label}</span>
      <small>Use 14+ characters with upper, lower, number, and symbol.</small>
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("cloak-crypt-theme") as Theme) || "light",
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("cloak-crypt-theme", theme);
  }, [theme]);
  return {
    theme,
    toggle: () => setTheme((current) => (current === "light" ? "dark" : "light")),
  };
}

function Brand() {
  return (
    <Link href="/" className="vl-brand" data-testid="link-brand">
      <img src={`${basePath}/logo.svg`} alt="Cloak Crypt" className="vl-logo" />
    </Link>
  );
}

function AuthActions() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  if (!isLoaded) return null;
  if (!isSignedIn) {
    return (
      <>
        <Link href="/sign-in" className="vl-btn vl-btn-quiet vl-btn-small">
          Sign in
        </Link>
        <Link href="/sign-up" className="vl-btn vl-btn-accent vl-btn-small">
          Sign up with Google
        </Link>
      </>
    );
  }
  return (
    <button className="vl-account" onClick={() => void signOut({ redirectUrl: basePath || "/" })}>
      <span className="vl-account-avatar">
        {user?.firstName?.slice(0, 1) || <UserRound size={14} />}
      </span>
      <span className="vl-account-name">{user?.firstName || "Account"}</span>
      <LogOut size={14} />
    </button>
  );
}

function Header({ theme, toggle }: { theme: Theme; toggle: () => void }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  return (
    <header className="vl-header">
      <div className="vl-container vl-nav">
        <Brand />
        <nav className={`vl-navlinks ${open ? "open" : ""}`} aria-label="Primary navigation">
          <Link href="/" className={`vl-navlink ${location === "/" ? "active" : ""}`}>
            Overview
          </Link>
          <Link
            href="/workspace"
            className={`vl-navlink ${location === "/workspace" ? "active" : ""}`}
          >
            My vault
          </Link>
          <Link href="/docs" className={`vl-navlink ${location === "/docs" ? "active" : ""}`}>
            Docs
          </Link>
        </nav>
        <div className="vl-actions">
          <button
            className="vl-icon-btn"
            onClick={toggle}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <AuthActions />
          <button
            className="vl-icon-btn vl-mobile-toggle"
            onClick={() => setOpen((current) => !current)}
            aria-label="Toggle navigation"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="vl-footer">
      <div className="vl-container vl-footer-inner">
        <span className="vl-mono">CLOAK CRYPT / PRIVATE BY CONSTRUCTION</span>
        <div className="vl-footer-links">
          <Link href="/workspace">My vault</Link>
          <Link href="/docs">Security docs</Link>
          <a href="#security">Security model</a>
        </div>
        <span>© 2026 AARYAN SINGH. ALL RIGHTS RESERVED.</span>
      </div>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="vl-shell vl-noise">
      <Header theme={theme} toggle={toggle} />
      {children}
      <Footer />
    </div>
  );
}

function Home() {
  return (
    <Shell>
      <main>
        <section className="vl-hero vl-grid">
          <div className="vl-container vl-hero-layout">
            <div className="vl-reveal">
              <div className="vl-eyebrow">Private by construction / 01</div>
              <h1 className="vl-display">
                Your data.
                <br />
                <em>Your device.</em>
                <br />
                No middleman.
              </h1>
              <p className="vl-lede">
                CLOAK CRYPT encrypts messages and images in your browser, then saves
                ciphertext-only history to your private account.
              </p>
              <div className="vl-hero-actions">
                <Link href="/workspace" className="vl-btn vl-btn-primary">
                  Open my vault <ArrowRight size={16} />
                </Link>
                <Link href="/docs" className="vl-btn vl-btn-quiet">
                  Read the protocol <BookOpen size={15} />
                </Link>
              </div>
              <div className="vl-trust-line">
                <span className="vl-pulse" />
                <span className="vl-mono">Google account · browser encryption · ciphertext only</span>
              </div>
            </div>
            <div className="vl-hero-canvas vl-reveal vl-delay-2" aria-label="CLOAK CRYPT encryption preview">
              <div className="vl-float one">
                <Check size={14} className="check" /> encrypted before upload
              </div>
              <div className="vl-terminal">
                <div className="vl-terminal-top">
                  <span>cloakcrypt://vault/private</span>
                  <div className="vl-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="vl-code">
                  <div className="dim">// plaintext stays in the browser</div>
                  <div>
                    <span className="teal">const</span> item = <span className="gold">await</span>{" "}
                    cloakCrypt.seal(
                  </div>
                  <div> message, <span className="gold">"your passphrase"</span></div>
                  <div>);</div>
                  <br />
                  <div>
                    <span className="teal">console</span>.log(item.saved);
                  </div>
                  <div className="dim">// ciphertext only</div>
                  <div>
                    <span className="teal">console</span>.log(item.algorithm);
                  </div>
                  <div className="dim">
                    // AES-256-GCM <span className="vl-cursor" />
                  </div>
                </div>
              </div>
              <div className="vl-float two">
                <Cloud size={14} className="check" /> saved to your private history
              </div>
            </div>
          </div>
        </section>
        <section className="vl-section" id="security">
          <div className="vl-container">
            <div className="vl-section-head">
              <div>
                <div className="vl-eyebrow">A small surface area / 02</div>
                <h2 className="vl-display">Privacy should be a property, not a promise.</h2>
              </div>
              <p className="vl-section-intro">
                Your browser creates the key and encrypts the content. The database keeps
                only the sealed payload needed to find it again later.
              </p>
            </div>
            <div className="vl-feature-grid">
              <article className="vl-feature">
                <span className="vl-feature-num">01 / ENCRYPTION</span>
                <div className="vl-feature-icon" style={{ marginTop: 28 }}>
                  <KeyRound size={18} />
                </div>
                <h3>A real cryptographic boundary.</h3>
                <p>
                  AES-256-GCM and PBKDF2-SHA-256 run locally. Your passphrase and plaintext
                  are never sent to the API.
                </p>
              </article>
              <article className="vl-feature">
                <span className="vl-feature-num">02 / HISTORY</span>
                <div className="vl-feature-icon" style={{ marginTop: 28 }}>
                  <History size={18} />
                </div>
                <h3>Come back when you need it.</h3>
                <p>Sign in later and see your encrypted messages and images from any device.</p>
              </article>
              <article className="vl-feature">
                <span className="vl-feature-num">03 / OPEN</span>
                <div className="vl-feature-icon" style={{ marginTop: 28 }}>
                  <Code2 size={18} />
                </div>
                <h3>Understand every byte.</h3>
                <p>Inspect the format, download an HTML container, and decrypt only with your passphrase.</p>
              </article>
            </div>
          </div>
        </section>
        <section className="vl-section-tight">
          <div className="vl-container vl-proof">
            <div className="vl-proof-copy">
              <div className="vl-eyebrow">Trust, then verify / 03</div>
              <h2 className="vl-display">Built for the moment before you hit send.</h2>
              <p className="vl-section-intro">
                CLOAK CRYPT is for private notes, images, credentials, and context that
                should not become someone else&apos;s readable database.
              </p>
            </div>
            <div className="vl-proof-list">
              {[
                ["Browser encryption", "Web Crypto API, not a decorative lock icon."],
                ["Google account history", "Your records are scoped to your signed-in account."],
                ["Ciphertext-only storage", "MongoDB receives the encrypted payload, never plaintext."],
                ["Keys stay with you", "Your passphrase is never saved or serialized."],
              ].map(([item, description], index) => (
                <div className="vl-proof-item" key={item}>
                  <span className="num">0{index + 1}</span>
                  <div>
                    <strong>{item}</strong>
                    <span>{description}</span>
                  </div>
                  <ChevronRight size={16} />
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="vl-section">
          <div className="vl-container">
            <div className="vl-cta">
              <div>
                <div className="vl-eyebrow">Ready when you are</div>
                <h2 className="vl-display">Put the message in a cloak.</h2>
              </div>
              <Link href="/workspace" className="vl-btn vl-btn-accent">
                Start encrypting <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function AuthRequired() {
  return (
    <Shell>
      <main className="vl-page">
        <div className="vl-container vl-auth-required">
          <div className="vl-eyebrow">Private vault access</div>
          <h1 className="vl-display">Sign in to open your vault.</h1>
          <p>Use your Google account to save encrypted history and return to it later.</p>
          <div className="vl-hero-actions">
            <Link href="/sign-in" className="vl-btn vl-btn-primary">
              Sign in with Google <ArrowRight size={16} />
            </Link>
            <Link href="/sign-up" className="vl-btn vl-btn-quiet">
              Create an account
            </Link>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function LoadingPage() {
  return (
    <Shell>
      <main className="vl-page">
        <div className="vl-container vl-loading">
          <Sparkles size={20} /> Loading your private vault...
        </div>
      </main>
    </Shell>
  );
}

function Workspace() {
  const [mode, setMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [contentKind, setContentKind] = useState<PayloadKind>("text");
  const [message, setMessage] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [payload, setPayload] = useState<ContainerPayload | null>(null);
  const [decrypted, setDecrypted] = useState("");
  const [decryptedImageUrl, setDecryptedImageUrl] = useState("");
  const [history, setHistory] = useState<VaultItemSummary[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const resetFeedback = () => {
    setStatus("");
    setError("");
  };

  const refreshHistory = async () => {
    setHistoryBusy(true);
    try {
      setHistory(await apiJson<VaultItemSummary[]>("/api/vault/items"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your vault history.");
    } finally {
      setHistoryBusy(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
    return () => {
      if (decryptedImageUrl) URL.revokeObjectURL(decryptedImageUrl);
    };
  }, []);

  const saveEncryptedItem = async (next: ContainerPayload, fileSize?: number) => {
    const saved = await apiJson<VaultItemSummary>("/api/vault/items", {
      method: "POST",
      body: JSON.stringify({
        name: next.fileName || `Encrypted message ${new Date().toLocaleString()}`,
        kind: next.kind,
        mimeType: next.mimeType,
        fileSize,
        payload: next,
      }),
    });
    setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    return saved;
  };

  const handleEncrypt = async () => {
    resetFeedback();
    setBusy(true);
    try {
      let bytes: Uint8Array;
      let details: Pick<ContainerPayload, "kind" | "mimeType" | "fileName">;
      let fileSize: number | undefined;
      if (contentKind === "image") {
        if (!assetFile) throw new Error("Choose an image before encrypting.");
        bytes = new Uint8Array(await assetFile.arrayBuffer());
        details = {
          kind: "image",
          mimeType: assetFile.type || "application/octet-stream",
          fileName: assetFile.name,
        };
        fileSize = assetFile.size;
      } else {
        bytes = new TextEncoder().encode(message);
        details = { kind: "text" };
      }
      const next = await encryptBytes(bytes, passphrase, details);
      setPayload(next);
      setDecrypted("");
      setDecryptedImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      try {
        await saveEncryptedItem(next, fileSize);
        setStatus("Encrypted in your browser and saved to your private vault.");
      } catch (cause) {
        setStatus("Encrypted locally. Download the container as a backup.");
        setError(cause instanceof Error ? cause.message : "Could not save vault history.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Encryption failed.");
    } finally {
      setBusy(false);
    }
  };

  const openPayload = async (next: ContainerPayload) => {
    const bytes = await decryptBytes(next, passphrase);
    if (next.kind === "image") {
      const url = URL.createObjectURL(
        new Blob([bytes], { type: next.mimeType || "application/octet-stream" }),
      );
      setDecryptedImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setDecrypted("");
    } else {
      setDecrypted(new TextDecoder().decode(bytes));
      setDecryptedImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
    }
  };

  const handleDecrypt = async () => {
    resetFeedback();
    if (!payload) {
      setError("Upload or choose an encrypted item first.");
      return;
    }
    setBusy(true);
    try {
      await openPayload(payload);
      setStatus("Container opened locally. The passphrase was not saved.");
    } catch {
      setError("Could not decrypt. Check the passphrase or container.");
    } finally {
      setBusy(false);
    }
  };

  const downloadContainer = () => {
    if (!payload) return;
    const blob = new Blob([containerHtml(payload)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName ? `${payload.fileName}.cloak.html` : "cloak-crypt-container.html";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded an encrypted CLOAK CRYPT container.");
  };

  const loadFile = async (file: File) => {
    resetFeedback();
    try {
      setPayload(extractPayload(await file.text()));
      setMode("decrypt");
      setStatus(`${file.name} loaded. Enter its passphrase to open it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that file.");
    }
  };

  const loadHistoryItem = async (item: VaultItemSummary) => {
    resetFeedback();
    setBusy(true);
    try {
      const detail = await apiJson<VaultItemDetail>(`/api/vault/items/${item.id}`);
      setPayload(detail.payload);
      setMode("decrypt");
      setPassphrase("");
      setStatus(`${item.name} loaded. Enter its passphrase to decrypt it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load that vault item.");
    } finally {
      setBusy(false);
    }
  };

  const deleteHistoryItem = async (item: VaultItemSummary) => {
    resetFeedback();
    try {
      await apiJson<void>(`/api/vault/items/${item.id}`, { method: "DELETE" });
      setHistory((current) => current.filter((entry) => entry.id !== item.id));
      setStatus("Encrypted item removed from your history.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that item.");
    }
  };

  const strength = getPasswordStrength(passphrase);

  return (
    <Shell>
      <main className="vl-page">
        <div className="vl-container">
          <div className="vl-page-head vl-reveal">
            <div>
              <div className="vl-eyebrow">Private vault / 04</div>
              <h1 className="vl-display">Keep it cloaked.</h1>
              <p>
                Encrypt text or images in this browser. Your account stores the encrypted
                payload so you can return weeks or years later.
              </p>
            </div>
            <div className="vl-status">
              <span /> Browser encryption active
            </div>
          </div>
          <div className="vl-workspace-layout">
            <section className="vl-panel vl-reveal vl-delay-1">
              <div className="vl-panel-head">
                <div className="vl-panel-title">
                  <FileLock2 size={17} /> Secure content
                </div>
                <div className="vl-api-tabs">
                  <button
                    className={`vl-api-tab ${mode === "encrypt" ? "active" : ""}`}
                    onClick={() => {
                      setMode("encrypt");
                      resetFeedback();
                    }}
                  >
                    Encrypt
                  </button>
                  <button
                    className={`vl-api-tab ${mode === "decrypt" ? "active" : ""}`}
                    onClick={() => {
                      setMode("decrypt");
                      resetFeedback();
                    }}
                  >
                    Decrypt
                  </button>
                </div>
              </div>
              {mode === "encrypt" ? (
                <div className="vl-form">
                  <div className="vl-content-tabs">
                    <button
                      className={`vl-content-tab ${contentKind === "text" ? "active" : ""}`}
                      onClick={() => setContentKind("text")}
                    >
                      <FileCode2 size={15} /> Message
                    </button>
                    <button
                      className={`vl-content-tab ${contentKind === "image" ? "active" : ""}`}
                      onClick={() => setContentKind("image")}
                    >
                      <FileImage size={15} /> Image
                    </button>
                  </div>
                  {contentKind === "text" ? (
                    <div className="vl-field">
                      <label className="vl-label" htmlFor="message">
                        Message
                      </label>
                      <textarea
                        id="message"
                        className="vl-textarea"
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Write something worth keeping private."
                      />
                    </div>
                  ) : (
                    <div
                      className="vl-file-drop vl-image-picker"
                      onClick={() => imageRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => event.key === "Enter" && imageRef.current?.click()}
                    >
                      <input
                        ref={imageRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => setAssetFile(event.target.files?.[0] || null)}
                      />
                      <ImagePlus size={26} />
                      <strong>{assetFile ? assetFile.name : "Choose an image to encrypt"}</strong>
                      <br />
                      <span>{assetFile ? `${formatSize(assetFile.size)} · local until saved` : "PNG, JPG, WEBP · up to 20 MB"}</span>
                    </div>
                  )}
                  <div className="vl-field">
                    <label className="vl-label" htmlFor="passphrase">
                      Passphrase
                    </label>
                    <input
                      id="passphrase"
                      className="vl-input"
                      type="password"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder="A phrase only you will remember"
                    />
                    <PasswordStrength passphrase={passphrase} />
                  </div>
                  <div className="vl-form-actions">
                    <button className="vl-btn vl-btn-primary" onClick={handleEncrypt} disabled={busy}>
                      {busy ? "Encrypting..." : "Encrypt and save"} <LockKeyhole size={15} />
                    </button>
                    {payload && (
                      <button className="vl-btn vl-btn-quiet" onClick={downloadContainer}>
                        <Download size={15} /> Download backup
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    className="vl-file-drop"
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => event.key === "Enter" && fileRef.current?.click()}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".html,text/html"
                      hidden
                      onChange={(event) => event.target.files?.[0] && loadFile(event.target.files[0])}
                    />
                    <UploadCloud size={24} />
                    <strong>{payload ? "Encrypted container loaded" : "Choose a CLOAK CRYPT container"}</strong>
                    <br />
                    <span>HTML files only · stays in this browser</span>
                  </div>
                  <div className="vl-form">
                    <div className="vl-field">
                      <label className="vl-label" htmlFor="decrypt-passphrase">
                        Passphrase
                      </label>
                      <input
                        id="decrypt-passphrase"
                        className="vl-input"
                        type="password"
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                        placeholder="Enter the container passphrase"
                      />
                    </div>
                    <div className="vl-form-actions">
                      <button className="vl-btn vl-btn-accent" onClick={handleDecrypt} disabled={busy || !payload}>
                        {busy ? "Opening..." : "Open container"} <UnlockKeyhole size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {status && (
                <div className="vl-success">
                  <Check size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />
                  {status}
                </div>
              )}
              {error && (
                <div className="vl-error">
                  <Info size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />
                  {error}
                </div>
              )}
            </section>
            <section className="vl-panel vl-reveal vl-delay-2">
              <div className="vl-panel-head">
                <div className="vl-panel-title">
                  <Terminal size={17} /> Output
                </div>
                {payload && <span className="vl-status">sealed</span>}
              </div>
              {decryptedImageUrl ? (
                <div className="vl-form">
                  <div className="vl-label">Decrypted image</div>
                  <img src={decryptedImageUrl} alt="Decrypted preview" className="vl-decrypted-image" />
                  <div className="vl-form-actions">
                    <button
                      className="vl-btn vl-btn-quiet"
                      onClick={() => {
                        const anchor = document.createElement("a");
                        anchor.href = decryptedImageUrl;
                        anchor.download = payload?.fileName || "decrypted-image";
                        anchor.click();
                      }}
                    >
                      <Download size={15} /> Download image
                    </button>
                  </div>
                </div>
              ) : decrypted ? (
                <div className="vl-form">
                  <div className="vl-label">Decrypted message</div>
                  <div className="vl-textarea vl-output-text">{decrypted}</div>
                  <div className="vl-form-actions">
                    <button
                      className="vl-btn vl-btn-quiet"
                      onClick={() => void navigator.clipboard.writeText(decrypted)}
                    >
                      <Copy size={15} /> Copy plaintext
                    </button>
                  </div>
                </div>
              ) : payload ? (
                <div className="vl-empty">
                  <div className="vl-empty-icon">
                    <Check size={23} />
                  </div>
                  <h3>Encrypted item ready</h3>
                  <p>Open it with the passphrase, or download the encrypted HTML backup.</p>
                  <button className="vl-btn vl-btn-accent" onClick={downloadContainer}>
                    <ArrowDownToLine size={15} /> Download container
                  </button>
                </div>
              ) : (
                <div className="vl-empty">
                  <div className="vl-empty-icon">
                    <LockKeyhole size={23} />
                  </div>
                  <h3>Your output appears here</h3>
                  <p>CLOAK CRYPT will show the sealed artifact and its local status after you encrypt.</p>
                </div>
              )}
            </section>
          </div>
          <section className="vl-panel vl-history-panel vl-reveal vl-delay-3">
            <div className="vl-panel-head">
              <div className="vl-panel-title">
                <History size={17} /> My encrypted history
              </div>
              <span className="vl-status">{history.length} saved</span>
            </div>
            {historyBusy ? (
              <div className="vl-history-empty">
                <Sparkles size={18} /> Loading your encrypted history...
              </div>
            ) : history.length === 0 ? (
              <div className="vl-history-empty">
                <Cloud size={18} /> Encrypt a message or image and it will appear here for later.
              </div>
            ) : (
              <div className="vl-history-list">
                {history.map((item) => (
                  <div className="vl-history-row" key={item.id}>
                    <div className="vl-history-icon">
                      {item.kind === "image" ? <FileImage size={17} /> : <FileCode2 size={17} />}
                    </div>
                    <div className="vl-history-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {item.kind === "image" ? "Encrypted image" : "Encrypted message"} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button className="vl-icon-btn" onClick={() => void loadHistoryItem(item)} aria-label={`Open ${item.name}`}>
                      <UnlockKeyhole size={15} />
                    </button>
                    <button className="vl-icon-btn vl-danger-btn" onClick={() => void deleteHistoryItem(item)} aria-label={`Delete ${item.name}`}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="vl-doc-note" style={{ marginTop: 18 }}>
            <ShieldCheck size={17} />
            <p>
              <strong>Security note.</strong> Your passphrase and plaintext never leave
              this browser. MongoDB stores only encrypted content and your account&apos;s
              history metadata. Use a unique passphrase and keep a downloaded backup.
            </p>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function formatSize(size?: number) {
  if (!size) return "Size unavailable";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const snippets: Record<string, string> = {
  JavaScript: `import { seal, open } from "@cloak-crypt/sdk";\n\nconst item = await seal(\n  "notes from the field",\n  { passphrase }\n);\n\nawait item.download("field-notes.html");`,
  TypeScript: `import { seal, type CloakCryptItem } from "@cloak-crypt/sdk";\n\nconst item: CloakCryptItem = await seal(\n  message,\n  { passphrase }\n);\n\nconsole.log(item.algorithm);\n// "AES-256-GCM"`,
  Python: `# Reference implementation planned\nitem = cloak_crypt.seal(\n    message,\n    passphrase=passphrase,\n)\nwrite_html(item, "notes.html")`,
  Go: `item, err := cloakcrypt.Seal(\n    []byte(message),\n    []byte(passphrase),\n)\nif err != nil { log.Fatal(err) }\nitem.WriteHTML("notes.html")`,
  Rust: `// Reference implementation planned\nlet item = cloak_crypt::seal(\n    message.as_bytes(),\n    passphrase.as_bytes(),\n)?;`,
  Java: `// Reference implementation planned\nCloakCryptItem item = CloakCrypt.seal(\n    message,\n    passphrase\n);`,
};

function Docs() {
  const [language, setLanguage] = useState("JavaScript");
  const [copied, setCopied] = useState(false);
  const snippet = snippets[language];
  const highlighted = useMemo(
    () =>
      snippet.split("\n").map((line, index) => {
        const content = line
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/(\/\/.*|#.*)/g, '<span class="syntax-c">$1</span>')
          .replace(
            /\b(import|from|const|await|let|use|pub|class|new|if|nil|func|return)\b/g,
            '<span class="syntax-k">$1</span>',
          )
          .replace(/("[^"]*")/g, '<span class="syntax-s">$1</span>');
        return <span key={`${language}-${index}`} dangerouslySetInnerHTML={{ __html: `${content}\n` }} />;
      }),
    [language, snippet],
  );
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Shell>
      <main className="vl-page">
        <div className="vl-container">
          <div className="vl-page-head vl-reveal">
            <div>
              <div className="vl-eyebrow">Developer surface / 05</div>
              <h1 className="vl-display">Readable security.</h1>
              <p>The CLOAK CRYPT protocol is small on purpose. Explore the same seal operation in the language your team already thinks in.</p>
            </div>
            <Link href="/workspace" className="vl-btn vl-btn-quiet">
              Try it live <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="vl-docs-layout">
            <aside className="vl-doc-nav" aria-label="Documentation sections">
              <p className="vl-doc-nav-label">On this page</p>
              <a href="#quickstart" className="active">Quickstart</a>
              <a href="#playground">Playground</a>
              <a href="#model">Security model</a>
              <a href="#formats">Formats</a>
            </aside>
            <div className="vl-doc-main">
              <section id="quickstart">
                <div className="vl-eyebrow">01 / quickstart</div>
                <h2>One message in, one private artifact out.</h2>
                <p>
                  CLOAK CRYPT uses browser Web Crypto API primitives: PBKDF2 turns a
                  passphrase into a 256-bit key, then AES-GCM authenticates and encrypts
                  the content with fresh salt and IV material.
                </p>
              </section>
              <section className="vl-api-card" id="playground">
                <div className="vl-api-top">
                  <div className="vl-api-tabs">
                    {Object.keys(snippets).map((item) => (
                      <button
                        key={item}
                        className={`vl-api-tab ${language === item ? "active" : ""}`}
                        onClick={() => {
                          setLanguage(item);
                          setCopied(false);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <button className="vl-icon-btn vl-code-copy" onClick={copy} aria-label="Copy code">
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
                <div className="vl-code-window">
                  <pre>{highlighted}</pre>
                </div>
              </section>
              <div className="vl-doc-note">
                <Info size={17} />
                <p>
                  Passphrases are never sent to the API. The MongoDB history stores only
                  encrypted payloads, so the original content cannot be read from the database alone.
                </p>
              </div>
              <section id="model" className="vl-section-tight">
                <div className="vl-eyebrow">02 / model</div>
                <h2>What gets stored.</h2>
                <p>
                  A CLOAK CRYPT item stores algorithm metadata, a fresh salt, a fresh IV,
                  and authenticated ciphertext. It does not store the passphrase, a user
                  identity inside the payload, or plaintext.
                </p>
                <div className="vl-language-grid">
                  {[
                    ["salt", "16 random bytes"],
                    ["iv", "12 random bytes"],
                    ["key", "256-bit derived key"],
                    ["tag", "GCM authentication"],
                  ].map(([name, value]) => (
                    <div className="vl-language" key={name}>
                      <strong>{name}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section id="formats" className="vl-section-tight">
                <div className="vl-eyebrow">03 / formats</div>
                <h2>HTML is the backup envelope.</h2>
                <p>
                  Downloaded containers are ordinary HTML files with a JSON payload inside
                  a script tag. They contain ciphertext only and still require the original
                  passphrase to open.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function SignInPage() {
  return (
    <div className="vl-auth-page">
      <Link href="/" className="vl-auth-brand">
        <Brand />
      </Link>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      <p className="vl-auth-footnote">Google sign-in is required to access your private vault.</p>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="vl-auth-page">
      <Link href="/" className="vl-auth-brand">
        <Brand />
      </Link>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      <p className="vl-auth-footnote">Create your CLOAK CRYPT account with Google.</p>
    </div>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingPage />;
  return isSignedIn ? <Redirect to="/workspace" /> : <Home />;
}

function ProtectedWorkspace() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <LoadingPage />;
  return isSignedIn ? <Workspace /> : <AuthRequired />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/workspace" component={ProtectedWorkspace} />
      <Route path="/docs" component={Docs} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkShell() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) =>
    basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        theme: shadcn,
        cssLayerName: "clerk",
        options: {
          logoPlacement: "inside",
          logoLinkUrl: basePath || "/",
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: "#176c68",
          colorForeground: "#1b2c38",
          colorMutedForeground: "#66737c",
          colorBackground: "#fffdf8",
          colorInput: "#f5f1e8",
          colorInputForeground: "#1b2c38",
          colorNeutral: "#ccd2d2",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          borderRadius: "0.75rem",
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to CLOAK CRYPT",
            subtitle: "Sign in with Google to open your private vault",
          },
        },
        signUp: {
          start: {
            title: "Create your CLOAK CRYPT account",
            subtitle: "Use Google to save encrypted history",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkShell />
        </WouterRouter>
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;