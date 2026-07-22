import * as yup from 'yup'

const toNumber = (_value: unknown, original: unknown) => {
  if (original === '' || original === null || original === undefined) return undefined
  const n = Number(original)
  return Number.isNaN(n) ? undefined : n
}

export const serviceSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required('El nombre del servicio es obligatorio')
    .min(2, 'Usa al menos 2 caracteres'),
  durationMinutes: yup
    .number()
    .transform(toNumber)
    .typeError('La duración debe ser un número')
    .required('La duración es obligatoria')
    .min(15, 'La duración mínima es 15 minutos')
    .max(480, 'La duración máxima es 480 minutos'),
  price: yup
    .number()
    .transform(toNumber)
    .typeError('El precio debe ser un número')
    .required('El precio es obligatorio')
    .min(0, 'El precio no puede ser negativo'),
  description: yup
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .default(''),
  isActive: yup.boolean().default(true),
})

export const workerSchema = yup.object({
  firstName: yup
    .string()
    .trim()
    .required('El nombre es obligatorio')
    .min(2, 'Usa al menos 2 caracteres'),
  lastName: yup
    .string()
    .trim()
    .required('El apellido es obligatorio')
    .min(1, 'El apellido es obligatorio'),
  phone: yup
    .string()
    .trim()
    .optional()
    .default('')
    .test('phone', 'Teléfono inválido (mín. 7 dígitos)', (v) => {
      if (!v) return true
      return v.replace(/\D/g, '').length >= 7
    }),
  isActive: yup.boolean().default(true),
})

export const clientSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required('El nombre es obligatorio')
    .min(2, 'Usa al menos 2 caracteres'),
  phone: yup
    .string()
    .trim()
    .optional()
    .default('')
    .test('phone', 'Teléfono inválido (mín. 7 dígitos)', (v) => {
      if (!v) return true
      return v.replace(/\D/g, '').length >= 7
    }),
  email: yup
    .string()
    .trim()
    .email('Correo inválido')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

export const loginSchema = yup.object({
  email: yup
    .string()
    .trim()
    .required('El correo es obligatorio')
    .email('Ingresa un correo válido'),
  password: yup
    .string()
    .required('La contraseña es obligatoria')
    .min(8, 'Mínimo 8 caracteres'),
})

export const registerSchema = yup.object({
  tenantName: yup
    .string()
    .trim()
    .required('El nombre del negocio es obligatorio')
    .min(2, 'Usa al menos 2 caracteres'),
  email: yup
    .string()
    .trim()
    .required('El correo es obligatorio')
    .email('Ingresa un correo válido'),
  password: yup
    .string()
    .required('La contraseña es obligatoria')
    .min(8, 'Mínimo 8 caracteres'),
})
