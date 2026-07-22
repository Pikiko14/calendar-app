<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import { useAuthStore } from '@/stores/auth'
import FormField from '@/components/ui/FormField.vue'
import { loginSchema, registerSchema } from '@/validation/schemas'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isRegister = computed(() => route.name === 'register')
const error = ref('')

type AuthFormValues = {
  tenantName: string
  email: string
  password: string
}

const schema = computed(() =>
  toTypedSchema(isRegister.value ? registerSchema : loginSchema),
)

const { handleSubmit, resetForm } = useForm<AuthFormValues>({
  validationSchema: schema as any,
  initialValues: {
    tenantName: '',
    email: isRegister.value ? '' : 'admin@barberiapremium.test',
    password: isRegister.value ? '' : 'Admin12345!',
  },
})

watch(isRegister, (reg) => {
  resetForm({
    values: {
      tenantName: '',
      email: reg ? '' : 'admin@barberiapremium.test',
      password: reg ? '' : 'Admin12345!',
    },
  })
})

const onSubmit = handleSubmit(async (values) => {
  error.value = ''
  try {
    if (isRegister.value) {
      await auth.register({
        tenantName: values.tenantName,
        email: values.email,
        password: values.password,
      })
    } else {
      await auth.login(values.email, values.password)
    }
    await router.push('/app')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo completar'
  }
})
</script>

<template>
  <div class="surface p-8 md:p-10">
    <p class="section-eyebrow">{{ isRegister ? 'Empieza gratis' : 'Bienvenido' }}</p>
    <h1 class="font-display mt-4 text-display-md font-bold text-ink dark:text-mist">
      {{ isRegister ? 'Crea tu empresa' : 'Inicia sesión' }}
    </h1>
    <p class="mt-3 text-ink-muted dark:text-white/50">
      {{ isRegister ? 'Tu espacio BeautyBook en minutos.' : 'Demo: admin@barberiapremium.test / Admin12345!' }}
    </p>

    <p
      v-if="error || auth.error"
      class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {{ error || auth.error }}
    </p>

    <form class="mt-8 space-y-4" novalidate @submit="onSubmit">
      <FormField
        v-if="isRegister"
        name="tenantName"
        label="Nombre del negocio"
        placeholder="Ej. Barbería Premium"
      />
      <FormField
        name="email"
        label="Correo electrónico"
        type="email"
        autocomplete="email"
        placeholder="tu@correo.com"
      />
      <FormField
        name="password"
        label="Contraseña"
        type="password"
        autocomplete="current-password"
        placeholder="Mínimo 8 caracteres"
        hint="Al menos 8 caracteres"
      />
      <button type="submit" class="btn-primary w-full" :disabled="auth.loading">
        {{ auth.loading ? 'Conectando…' : isRegister ? 'Crear empresa' : 'Entrar a BeautyBook' }}
      </button>
    </form>

    <p class="mt-7 text-center text-sm text-ink-muted dark:text-white/45">
      {{ isRegister ? '¿Ya tienes cuenta?' : '¿Aún no tienes empresa?' }}
      <RouterLink
        :to="isRegister ? '/login' : '/register'"
        class="font-semibold text-brand-700 hover:underline dark:text-brand-300"
      >
        {{ isRegister ? 'Inicia sesión' : 'Crear cuenta' }}
      </RouterLink>
    </p>
  </div>
</template>
