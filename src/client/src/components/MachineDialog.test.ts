// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { MachineDialog, machineBaseUrlValidationMessage, suggestedMachineNameFromUrl } from "./MachineDialog";
import { deepActiveElement, pressKey, requiredElement, settleRenderedDialog } from "./modalSurfaceTestSupport";

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("machine-dialog modal surface", () => {
  it("focuses the base URL input when opened", async () => {
    const dialog = await mountDialog();

    expect(deepActiveElement()).toBe(urlInput(dialog));
  });

  it("cancels on Escape", async () => {
    const onCancel = vi.fn<() => void>();
    const dialog = await mountDialog({ onCancel });

    pressKey(urlInput(dialog), "Escape");

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("moves focus to the machine name on Enter in a valid base URL", async () => {
    const dialog = await mountDialog();
    const url = urlInput(dialog);
    url.value = "http://devbox.local:8504";
    url.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await settleRenderedDialog(dialog);

    pressKey(url, "Enter");
    await settleRenderedDialog(dialog);

    expect(deepActiveElement()).toBe(nameInput(dialog));
  });
});

describe("machine-dialog connection modes", () => {
  it("submits a direct connection by default", async () => {
    const onSubmit = vi.fn<(input: unknown) => void>();
    const dialog = await mountDialog({ onSubmit });
    await fillMachineForm(dialog, { mode: "direct" });

    submit(dialog);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ connection: { mode: "direct" } }));
  });

  it("switches to SSH mode, loads ssh config hosts, and submits the ssh connection", async () => {
    const onLoadSshHosts = vi.fn(() => Promise.resolve(["alpha", "beta"]));
    const onSubmit = vi.fn<(input: unknown) => void>();
    const dialog = await mountDialog({ onSubmit, onLoadSshHosts });

    const sshRadio = requiredElement(dialog.shadowRoot?.querySelector<HTMLInputElement>("input[value='ssh']"), "ssh mode radio");
    sshRadio.click();
    await settleRenderedDialog(dialog);

    expect(onLoadSshHosts).toHaveBeenCalledOnce();
    const options = dialog.shadowRoot?.querySelectorAll("datalist#ssh-config-hosts option");
    expect(options?.length).toBe(2);

    await fillMachineForm(dialog, { mode: "ssh", host: "home", port: "2222", user: "jobs", password: "pw" });
    submit(dialog);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      connection: { mode: "ssh", ssh: { host: "home", port: 2222, user: "jobs", password: "pw" } },
    }));
  });

  it("requires an ssh host before submitting", async () => {
    const onSubmit = vi.fn<(input: unknown) => void>();
    const dialog = await mountDialog({ onSubmit });
    requiredElement(dialog.shadowRoot?.querySelector<HTMLInputElement>("input[value='ssh']"), "ssh mode radio").click();
    await settleRenderedDialog(dialog);

    await fillMachineForm(dialog, { mode: "ssh" });
    submit(dialog);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(submitButton(dialog).disabled).toBe(true);
  });

  it("rejects identity file and password together", async () => {
    const onSubmit = vi.fn<(input: unknown) => void>();
    const dialog = await mountDialog({ onSubmit });
    requiredElement(dialog.shadowRoot?.querySelector<HTMLInputElement>("input[value='ssh']"), "ssh mode radio").click();
    await settleRenderedDialog(dialog);

    await fillMachineForm(dialog, { mode: "ssh", host: "home", identityFile: "/keys/id", password: "pw" });
    submit(dialog);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog.shadowRoot?.textContent).toContain("not both");
  });
});

async function fillMachineForm(dialog: MachineDialog, values: { mode: "direct" | "ssh"; host?: string; port?: string; user?: string; identityFile?: string; password?: string }): Promise<void> {
  const setInput = (input: HTMLInputElement | undefined, value: string): void => {
    if (input === undefined) throw new Error("missing input");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };
  setInput(urlInput(dialog), "http://127.0.0.1:8505");
  await settleRenderedDialog(dialog);
  setInput(nameInput(dialog), "Dev");
  if (values.mode === "ssh") {
    setInput(sshInput(dialog, "sshHost"), values.host ?? "");
    setInput(sshInput(dialog, "sshPort"), values.port ?? "");
    setInput(sshInput(dialog, "sshUser"), values.user ?? "");
    setInput(sshInput(dialog, "sshIdentityFile"), values.identityFile ?? "");
    setInput(sshInput(dialog, "sshPassword"), values.password ?? "");
  }
  await settleRenderedDialog(dialog);
}

function sshInput(dialog: MachineDialog, name: string): HTMLInputElement | undefined {
  return dialog.shadowRoot?.querySelector<HTMLInputElement>(`input[name='${name}']`) ?? undefined;
}

function submitButton(dialog: MachineDialog): HTMLButtonElement {
  return requiredElement(dialog.shadowRoot?.querySelector<HTMLButtonElement>("button[type='submit']"), "machine-dialog submit button");
}

function submit(dialog: MachineDialog): void {
  submitButton(dialog).click();
}

async function mountDialog(props: { onCancel?: () => void; onSubmit?: (input: unknown) => void; onLoadSshHosts?: () => Promise<string[]> } = {}): Promise<MachineDialog> {
  const dialog = new MachineDialog();
  if (props.onCancel !== undefined) dialog.onCancel = props.onCancel;
  if (props.onSubmit !== undefined) dialog.onSubmit = props.onSubmit;
  if (props.onLoadSshHosts !== undefined) dialog.onLoadSshHosts = props.onLoadSshHosts;
  document.body.append(dialog);
  await settleRenderedDialog(dialog);
  return dialog;
}

function urlInput(dialog: MachineDialog): HTMLInputElement {
  return requiredElement(dialog.shadowRoot?.querySelector<HTMLInputElement>("input[name='baseUrl']"), "machine-dialog base URL input");
}

function nameInput(dialog: MachineDialog): HTMLInputElement {
  return requiredElement(dialog.shadowRoot?.querySelector<HTMLInputElement>("input[name='name']"), "machine-dialog name input");
}

describe("suggestedMachineNameFromUrl", () => {
  it("suggests the host without protocol or port", () => {
    expect(suggestedMachineNameFromUrl("http://127.0.0.1:8504")).toBe("127.0.0.1");
    expect(suggestedMachineNameFromUrl("https://devbox.example.test:8504/pi-web")).toBe("devbox.example.test");
  });

  it("also suggests a host while the URL protocol is being typed", () => {
    expect(suggestedMachineNameFromUrl("devbox.local:8504")).toBe("devbox.local");
  });
});

describe("machineBaseUrlValidationMessage", () => {
  it("accepts http and https base URLs", () => {
    expect(machineBaseUrlValidationMessage("http://127.0.0.1:8504")).toBeUndefined();
    expect(machineBaseUrlValidationMessage("https://devbox.example.test/pi-web")).toBeUndefined();
  });

  it("explains invalid machine URLs", () => {
    expect(machineBaseUrlValidationMessage("")).toBe("Remote PI WEB URL is required.");
    expect(machineBaseUrlValidationMessage("devbox.local:8504")).toBe("Use an http:// or https:// URL.");
    expect(machineBaseUrlValidationMessage("ftp://devbox.example.test")).toBe("Use an http:// or https:// URL.");
    expect(machineBaseUrlValidationMessage("https://user@devbox.example.test")).toBe("Do not include credentials in the machine URL.");
    expect(machineBaseUrlValidationMessage("https://devbox.example.test?q=1")).toBe("Do not include a query string or fragment.");
  });
});
