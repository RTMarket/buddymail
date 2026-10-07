import React from "react";
import { clsx } from "clsx";

/** 站点品牌标志（静态资源 `/brand/bigsocialboss-logo.png`） */
export function BrandLogo(props: { className?: string; variant?: "sidebar" | "gate" }) {
  const { variant = "sidebar" } = props;

  if (variant === "sidebar") {
    // 进入站点后侧栏：横向条带裁切；垂直位置偏下以完整露出底部手势，同时略加高度
    return (
      <div
        className={clsx(
          "w-full max-w-full overflow-hidden rounded-md",
          "h-24 sm:h-28",
          props.className
        )}
      >
        <img
          src="/brand/bigsocialboss-logo.png"
          alt="BigSocialBoss"
          width={1024}
          height={915}
          decoding="async"
          className="h-full w-full min-h-0 object-cover object-[center_58%]"
        />
      </div>
    );
  }

  return (
    <img
      src="/brand/bigsocialboss-logo.png"
      alt="BigSocialBoss"
      width={1024}
      height={915}
      decoding="async"
      className={clsx(
        "h-auto w-auto max-w-full object-contain object-left",
        // 注册页等左右分栏布局：避免 max-w-[52rem] 撑破 flex 子项盖住右侧表单（按钮点不动）
        "max-h-[min(28rem,52vh)] w-auto max-w-[min(100%,96vw)] sm:max-h-[min(32rem,55vh)]",
        props.className
      )}
    />
  );
}
