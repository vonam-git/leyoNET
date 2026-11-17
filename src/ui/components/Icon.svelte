<script lang="ts" module>
  /** Einfache Linien-Symbole (24×24), eigene Zeichnungen. */
  const PATHS: Record<string, string> = {
    undo: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
    pointer: 'M5 3l13 8-6 1.5L9 19z',
    cable: 'M4 20c4 0 4-8 8-8s4-8 8-8 M3 19.5h3v1.5H3z M18 3h3v1.5h-3z',
    area: 'M4 4h16v16H4z M4 9h16',
    zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M11 8v6 M8 11h6',
    zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M8 11h6',
    fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
    center: 'M12 4v4 M12 16v4 M4 12h4 M16 12h4 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    rack: 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h6',
    snapshot: 'M4 7h4l2-3h4l2 3h4v12H4z M12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    calc: 'M6 3h12v18H6z M9 7h6 M9 11h1 M12 11h1 M15 11h0 M9 14h1 M12 14h1 M9 17h1 M12 17h1 M15 14v3',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14 M12 17h.01',
    play: 'M7 4l12 8-12 8z',
    pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
    step: 'M5 4l9 8-9 8z M17 4h2v16h-2z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 2-1.4 1.4L4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.4 1.4L7 19l3 1 1-2h2l1 2 3-1-.4-2 1.4-1.4 2 .4 1-3z',
    terminal: 'M4 5h16v14H4z M7 9l3 3-3 3 M12 15h5',
    desktop: 'M3 4h18v12H3z M8 20h8 M12 16v4',
    trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
    copy: 'M8 8h11v12H8z M5 16V4h11',
    plus: 'M12 5v14 M5 12h14',
    close: 'M6 6l12 12 M18 6 6 18',
    tag: 'M3 12V4h8l9 9-8 8z M7.5 7.5h.01',
    coins: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7 M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5',
    list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
    download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
    lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
    filter: 'M4 5h16l-6 8v6l-4-2v-4z',
    star: 'M12 3l2.7 5.6 6.2.9-4.5 4.4 1 6.1-5.4-2.9-5.6 2.9 1.1-6.1-4.5-4.4 6.2-.9z',
    chevron: 'M9 6l6 6-6 6',
    home: 'M4 11l8-7 8 7 M6 9.5V20h4.5v-5h3v5H18V9.5',
    clipboard: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12l2 2 4-4 M8.5 17h7',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 4.5a3.3 3.3 0 0 1 0 6.3 M18 14.3c1.8.8 3 2.7 3 5.2',
    chart: 'M4 20h16 M7 16v-5 M12 16V6 M17 16v-8',
    key: 'M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M11.5 11H21 M18 11v3 M15 11v2.5',
    message: 'M4 5h16v11H9l-5 4z',
    shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z M9 12l2 2 4-4',
    checks: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8 12.5l2.7 2.7L16 9.8',
    logout: 'M14 4H5v16h9 M10 12h10 M16 8l4 4-4 4',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    refresh: 'M20 11a8 8 0 0 0-14.3-4.6L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.3 4.6L20 16 M20 20v-4h-4',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
    printer: 'M7 9V3h10v6 M5 9h14v8h-3 M8 17H5 M8 14h8v7H8z',
    external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  };
</script>

<script lang="ts">
  let { name, size = 18, title }: { name: keyof typeof PATHS | string; size?: number; title?: string } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={title ? undefined : 'true'}
  role={title ? 'img' : undefined}
>
  {#if title}<title>{title}</title>{/if}
  <path d={PATHS[name] ?? ''} />
</svg>

<style>
  .icon {
    flex: none;
    display: block;
  }
</style>
