<script lang="ts">
  import { desktops } from '../state/desktop.svelte';
  import DesktopWindow from './DesktopWindow.svelte';

  /**
   * Alle offenen Desktops der Simulation. Minimierte bleiben geladen (Terminal
   * und Browser behalten ihren Inhalt); die Taskleiste steht in der
   * Simulationsleiste (DesktopTaskbar).
   */
</script>

{#each desktops.windows as win, index (win.deviceId)}
  <DesktopWindow {win} {index} />
{/each}
