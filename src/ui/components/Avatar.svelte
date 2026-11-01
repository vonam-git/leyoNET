<script lang="ts">
  import { HAIR_COLORS, SHIRTS, SKINS, type AvatarConfig } from '../avatar';

  /**
   * Gezeichneter Avatar (eigene Gestaltung, keine fremden Grafiken).
   * `talking`: Mund bewegt sich, solange die Lehrperson «spricht».
   */
  let { config, size = 96, talking = false }: { config: AvatarConfig; size?: number; talking?: boolean } = $props();

  const skin = $derived(SKINS[config.skin]!);
  const hair = $derived(HAIR_COLORS[config.hairColor]!);
  const shirt = $derived(SHIRTS[config.shirt]!);
</script>

<svg class="avatar" class:talking width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
  <!-- Hintergrund -->
  <circle cx="50" cy="50" r="49" class="bg" />
  <!-- Haare hinten (lang, Dutt) -->
  {#if config.hair === 'long'}
    <path d="M24 44 Q22 80 32 86 L68 86 Q78 80 76 44 Q50 30 24 44 Z" fill={hair} />
  {:else if config.hair === 'bun'}
    <circle cx="50" cy="16" r="9" fill={hair} />
  {/if}
  <!-- Oberkörper -->
  <path d="M18 100 Q20 76 50 74 Q80 76 82 100 Z" fill={shirt} />
  <path d="M42 75 L50 84 L58 75" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.4" stroke-linejoin="round" />
  <!-- Hals und Kopf -->
  <rect x="43" y="62" width="14" height="14" rx="5" fill={skin} />
  <ellipse cx="50" cy="46" rx="20" ry="23" fill={skin} />
  <ellipse cx="29.5" cy="48" rx="3.4" ry="5" fill={skin} />
  <ellipse cx="70.5" cy="48" rx="3.4" ry="5" fill={skin} />
  <!-- Bart -->
  {#if config.beard === 'full'}
    <path d="M31 50 Q32 70 50 72 Q68 70 69 50 Q66 62 58 60 Q50 57 42 60 Q34 62 31 50 Z" fill={hair} />
  {:else if config.beard === 'stubble'}
    <path d="M32 52 Q34 69 50 70 Q66 69 68 52 Q64 62 50 62 Q36 62 32 52 Z" fill={hair} opacity="0.28" />
  {/if}
  {#if config.beard === 'moustache' || config.beard === 'full'}
    <path d="M41 57 Q50 52 59 57 Q50 55 41 57 Z" fill={hair} stroke={hair} stroke-width="2.2" stroke-linejoin="round" />
  {/if}
  <!-- Augen (blinzeln) -->
  <g class="eyes">
    <ellipse cx="42" cy="45" rx="2.4" ry="2.8" fill="#1f2937" />
    <ellipse cx="58" cy="45" rx="2.4" ry="2.8" fill="#1f2937" />
  </g>
  <path d="M37 39 Q42 37 46 39 M54 39 Q58 37 63 39" fill="none" stroke={hair} stroke-width="1.8" stroke-linecap="round" />
  <!-- Nase und Mund -->
  <path d="M50 47 Q48 53 51 54" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" stroke-linecap="round" />
  <path class="mouth" d="M43 60 Q50 65 57 60" fill="none" stroke="#7a2e2e" stroke-width="2" stroke-linecap="round" />
  <ellipse class="mouth-open" cx="50" cy="61" rx="4.5" ry="2.6" fill="#7a2e2e" />
  <!-- Brille -->
  {#if config.glasses === 'round'}
    <g fill="none" stroke="#1f2937" stroke-width="1.6"><circle cx="42" cy="45" r="6" /><circle cx="58" cy="45" r="6" /><path d="M48 45 H52 M36 44 L31 43 M64 44 L69 43" /></g>
  {:else if config.glasses === 'square'}
    <g fill="none" stroke="#1f2937" stroke-width="1.6"><rect x="35" y="40" width="13" height="10" rx="2.5" /><rect x="52" y="40" width="13" height="10" rx="2.5" /><path d="M48 44 H52 M35 44 L31 43 M65 44 L69 43" /></g>
  {/if}
  <!-- Haare vorne -->
  {#if config.hair === 'short'}
    <path d="M30 42 Q30 22 50 22 Q70 22 70 42 Q66 31 50 31 Q36 31 30 42 Z" fill={hair} />
  {:else if config.hair === 'side'}
    <path d="M30 44 Q28 21 52 21 Q72 22 70 40 Q62 28 44 34 Q36 37 30 44 Z" fill={hair} />
  {:else if config.hair === 'curly'}
    <g fill={hair}>
      {#each [[33, 34], [38, 27], [45, 23], [52, 22], [59, 24], [65, 29], [68, 36], [31, 41]] as [x, y], i (i)}<circle cx={x} cy={y} r="6" />{/each}
    </g>
  {:else if config.hair === 'long' || config.hair === 'bun'}
    <path d="M29 46 Q28 22 50 22 Q72 22 71 46 Q68 30 50 29 Q32 30 29 46 Z" fill={hair} />
  {/if}
  <!-- Extras -->
  {#if config.extra === 'headset'}
    <g fill="none" stroke="#1f2937" stroke-width="2.4" stroke-linecap="round">
      <path d="M28 46 Q28 18 50 18 Q72 18 72 46" />
      <path d="M29 52 Q32 64 42 64" stroke-width="1.8" />
    </g>
    <rect x="25" y="42" width="6" height="11" rx="2.5" fill="#1f2937" />
    <rect x="69" y="42" width="6" height="11" rx="2.5" fill="#1f2937" />
    <circle cx="43" cy="64" r="2.2" fill="#1f2937" />
  {:else if config.extra === 'cap'}
    <path d="M29 36 Q30 18 50 18 Q70 18 71 36 Z" fill={shirt} />
    <path d="M50 34 Q70 33 82 38 Q70 40 50 37 Z" fill={shirt} stroke="rgba(0,0,0,0.25)" stroke-width="1" />
  {/if}
</svg>

<style>
  .avatar {
    display: block;
    flex: none;
  }
  .bg {
    fill: color-mix(in srgb, var(--accent) 14%, var(--surface));
    stroke: color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .eyes {
    transform-origin: 50px 45px;
    animation: blink 5s infinite;
  }
  @keyframes blink {
    0%,
    95%,
    100% {
      transform: scaleY(1);
    }
    97% {
      transform: scaleY(0.1);
    }
  }
  .mouth-open {
    opacity: 0;
  }
  .talking .mouth-open {
    animation: talk 0.32s infinite alternate;
  }
  .talking .mouth {
    animation: talk 0.32s infinite alternate-reverse;
  }
  @keyframes talk {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .eyes,
    .talking .mouth,
    .talking .mouth-open {
      animation: none;
    }
  }
</style>
