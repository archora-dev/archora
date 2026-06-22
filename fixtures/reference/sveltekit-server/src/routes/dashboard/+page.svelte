<script lang="ts">
  import { formatDate } from '$lib/format';
  export let data: { stamp: string };
</script>
<p>Now: {formatDate(Date.now())}</p>
<p>{data.stamp}</p>
