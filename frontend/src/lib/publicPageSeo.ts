type AlternateLink = {
  hreflang: string;
  href: string;
};

type PublicPageSeoInput = {
  lang: string;
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  alternateLinks?: AlternateLink[];
  image?: string;
  type?: string;
};

export function applyPublicPageSeo(input: PublicPageSeoInput) {
  document.documentElement.lang = input.lang;
  document.title = input.title;

  if (input.description) {
    upsertMeta("description", input.description);
  }

  upsertMeta("robots", input.robots ?? "index,follow,max-image-preview:large");
  upsertPropertyMeta("og:title", input.title);
  upsertPropertyMeta("og:description", input.description ?? "");
  upsertPropertyMeta("og:type", input.type ?? "website");
  upsertPropertyMeta("og:url", input.canonical ?? window.location.href);
  upsertPropertyMeta("og:site_name", "BigSocialBoss");
  upsertMeta("twitter:card", "summary_large_image");
  upsertMeta("twitter:title", input.title);
  upsertMeta("twitter:description", input.description ?? "");
  if (input.image) {
    upsertPropertyMeta("og:image", input.image);
    upsertMeta("twitter:image", input.image);
  }

  if (input.canonical) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", input.canonical);
  }

  document.querySelectorAll('link[data-bsb-alternate="true"]').forEach((node) => node.remove());
  for (const link of input.alternateLinks ?? []) {
    const el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", link.hreflang);
    el.setAttribute("href", link.href);
    el.setAttribute("data-bsb-alternate", "true");
    document.head.appendChild(el);
  }
}

function upsertMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function upsertPropertyMeta(property: string, content: string) {
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}
