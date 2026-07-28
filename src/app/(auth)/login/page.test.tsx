import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LoginPage from "./page";

describe("LoginPage", () => {
  afterEach(cleanup);

  it("offers only the private sign-in path", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "欢迎回到我们的空间" })).toBeVisible();
    expect(screen.getByText("这里只属于我们两个人")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "邮箱" })).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("密码")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "进入日记" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /注册|sign up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /注册|sign up/i })).not.toBeInTheDocument();
  });

  it("associates an invalid sign-in message with both fields", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "invalid" }) }));

    const error = screen.getByText("登录失败，请检查邮箱或密码。");
    expect(error).toHaveAttribute("id", "login-error");
    expect(screen.getByRole("textbox", { name: "邮箱" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("密码")).toHaveAttribute("aria-describedby", "login-error");
  });
});
