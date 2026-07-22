<script setup lang="ts">
const features = [
  {
    title: 'Agenda inteligente',
    copy: 'Sin choques de horario. Disponibilidad en tiempo real para cada profesional.',
  },
  {
    title: 'WhatsApp que vende',
    copy: 'Reservas, confirmaciones y recordatorios automáticos desde el chat.',
  },
  {
    title: 'Portal a tu medida',
    copy: 'Tu marca, tus colores, tu enlace. Los clientes reservan en segundos.',
  },
]
</script>

<template>
  <div>
    <!-- HERO: una composición, brand primero, imagen full-bleed -->
    <section class="relative min-h-[100svh] overflow-hidden">
      <div class="absolute inset-0 animate-scale-in">
        <img
          src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=2400&q=80"
          alt="Interior de barbería con sillas y espejos"
          class="h-full w-full object-cover"
        />
        <div
          class="absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/45 to-ink/85 dark:from-ink/70 dark:via-ink/60 dark:to-ink"
        />
        <div class="absolute inset-0 bg-mesh opacity-40" />
      </div>

      <div class="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-5 pb-16 pt-28 md:px-8 md:pb-24">
        <p class="font-display animate-fade-up text-display-xl font-extrabold text-white">
          BeautyBook
        </p>
        <h1 class="mt-5 max-w-3xl animate-fade-up-delay text-balance text-2xl font-light leading-snug text-white/90 md:text-4xl">
          La agenda que hace brillar barberías, peluquerías y SPA.
        </h1>
        <p class="mt-5 max-w-lg animate-fade-up-delay-2 text-base leading-relaxed text-white/70 md:text-lg">
          Reservas fluidas, equipo sincronizado y WhatsApp automático. Menos caos, más citas.
        </p>
        <div class="mt-10 flex flex-wrap gap-3 animate-fade-up-delay-2">
          <RouterLink to="/register" class="btn-primary !bg-white !text-ink hover:!bg-mist">
            Crear mi empresa
          </RouterLink>
          <RouterLink to="/barberia-premium" class="btn-ghost !border-white/30 !bg-white/10 !text-white hover:!bg-white/20">
            Ver portal demo
          </RouterLink>
        </div>
      </div>

      <div class="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 md:block">
        <div class="h-10 w-px animate-float bg-gradient-to-b from-white/0 via-white/60 to-white/0" />
      </div>
    </section>

    <!-- Sección 1: promesa -->
    <section class="relative overflow-hidden bg-mist px-5 py-24 dark:bg-ink md:px-8 md:py-32">
      <div class="absolute inset-0 bg-mesh opacity-60 dark:opacity-30" />
      <div class="relative mx-auto max-w-5xl text-center">
        <p class="section-eyebrow">Hecho para crecer</p>
        <h2 class="font-display mt-5 text-display-md font-bold text-ink dark:text-mist">
          Belleza en movimiento.<br class="hidden sm:block" />
          Operación en control.
        </h2>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted dark:text-white/55">
          Una plataforma multiempresa pensada como Calendly, con el ritmo de Fresha y la cercanía de Booksy.
        </p>
      </div>
    </section>

    <!-- Sección 2: features (una idea por bloque) -->
    <section class="border-y border-ink/5 bg-white px-5 py-20 dark:border-white/5 dark:bg-ink-soft md:px-8 md:py-28">
      <div class="mx-auto grid max-w-7xl gap-16 md:grid-cols-3 md:gap-10">
        <article
          v-for="(item, i) in features"
          :key="item.title"
          class="group"
          :style="{ animationDelay: `${i * 0.1}s` }"
        >
          <span class="font-display text-5xl font-bold text-brand-700/20 transition group-hover:text-brand-700/40 dark:text-brand-400/20">
            0{{ i + 1 }}
          </span>
          <h3 class="font-display mt-4 text-2xl font-bold text-ink dark:text-mist">{{ item.title }}</h3>
          <p class="mt-3 text-base leading-relaxed text-ink-muted dark:text-white/55">{{ item.copy }}</p>
        </article>
      </div>
    </section>

    <!-- Sección 3: visual + CTA -->
    <section class="relative overflow-hidden px-5 py-24 md:px-8 md:py-32">
      <div class="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=2000&q=80"
          alt="Salón de belleza con luz natural"
          class="h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-ink/75" />
      </div>
      <div class="relative mx-auto max-w-3xl text-center text-white">
        <h2 class="font-display text-display-md font-bold">Tu marca. Tu ritmo. Tu agenda.</h2>
        <p class="mx-auto mt-5 max-w-xl text-lg text-white/70">
          Empieza en minutos. Invita a tu equipo. Abre el portal y deja que las reservas fluyan.
        </p>
        <div class="mt-10 flex flex-wrap justify-center gap-3">
          <RouterLink to="/register" class="btn-primary !bg-brand-500 hover:!bg-brand-400">
            Empezar gratis
          </RouterLink>
          <RouterLink to="/login" class="btn-ghost !border-white/25 !text-white">
            Ya tengo cuenta
          </RouterLink>
        </div>
      </div>
    </section>

    <footer class="border-t border-ink/5 bg-mist px-5 py-10 dark:border-white/5 dark:bg-ink md:px-8">
      <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p class="font-display text-lg font-bold">BeautyBook</p>
        <p class="text-sm text-ink-muted dark:text-white/40">© {{ new Date().getFullYear() }} — Agenda para negocios de belleza</p>
      </div>
    </footer>
  </div>
</template>
