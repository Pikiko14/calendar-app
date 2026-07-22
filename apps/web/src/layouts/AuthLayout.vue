<template>
  <main class="relative min-h-screen overflow-hidden px-5 py-10 md:py-16">
    <div class="absolute inset-0 bg-mesh" />
    <div class="grain-overlay absolute inset-0" />

    <div class="relative mx-auto mb-12 flex max-w-md items-center justify-between">
      <RouterLink to="/" class="font-display text-2xl font-bold text-brand-800 dark:text-brand-300">
        BeautyBook
      </RouterLink>
      <RouterLink to="/" class="text-sm text-ink-muted transition hover:text-brand-700 dark:text-white/50">
        ← Inicio
      </RouterLink>
    </div>

    <section class="relative mx-auto max-w-md">
      <RouterView />
    </section>
  </main>
</template>
