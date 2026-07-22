import Swal from 'sweetalert2'

const brand = {
  confirm: '#0F766E',
  cancel: '#94A3B8',
  danger: '#DC2626',
}

function baseOptions() {
  const dark = document.documentElement.classList.contains('dark')
  return {
    background: dark ? '#0B1F1C' : '#ffffff',
    color: dark ? '#F3F7F5' : '#0B1F1C',
    buttonsStyling: false,
    reverseButtons: true,
    customClass: {
      popup: 'rounded-3xl shadow-lift border border-black/5 dark:border-white/10 !font-sans',
      title: '!font-display !text-xl !font-bold',
      htmlContainer: '!text-sm !text-ink-muted dark:!text-white/60',
      confirmButton:
        'btn-primary !inline-flex !mx-1.5 !px-5 !py-2.5 !rounded-full !text-sm !font-semibold',
      cancelButton:
        'btn-ghost !inline-flex !mx-1.5 !px-5 !py-2.5 !rounded-full !text-sm !font-semibold',
      denyButton:
        'btn-ghost !inline-flex !mx-1.5 !px-5 !py-2.5 !rounded-full !text-sm !font-semibold',
    },
  }
}

export async function confirmAction(options: {
  title: string
  text?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}) {
  const result = await Swal.fire({
    ...baseOptions(),
    icon: options.danger ? 'warning' : 'question',
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText || 'Confirmar',
    cancelButtonText: options.cancelText || 'Cancelar',
    confirmButtonColor: options.danger ? brand.danger : brand.confirm,
    cancelButtonColor: brand.cancel,
    focusCancel: true,
    customClass: {
      ...baseOptions().customClass,
      confirmButton: options.danger
        ? '!inline-flex !mx-1.5 !px-5 !py-2.5 !rounded-full !text-sm !font-semibold !bg-red-600 !text-white hover:!bg-red-700'
        : baseOptions().customClass.confirmButton,
    },
  })
  return result.isConfirmed
}

/** Confirmación con campo de texto obligatorio (ej. motivo de cancelación). */
export async function promptText(options: {
  title: string
  text?: string
  inputLabel?: string
  inputPlaceholder?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  minLength?: number
}): Promise<string | null> {
  const min = options.minLength ?? 5
  const result = await Swal.fire({
    ...baseOptions(),
    icon: options.danger ? 'warning' : 'question',
    title: options.title,
    text: options.text,
    input: 'textarea',
    inputLabel: options.inputLabel,
    inputPlaceholder: options.inputPlaceholder || 'Escribe aquí…',
    inputAttributes: {
      'aria-label': options.inputLabel || 'Motivo',
    },
    showCancelButton: true,
    confirmButtonText: options.confirmText || 'Confirmar',
    cancelButtonText: options.cancelText || 'Volver',
    confirmButtonColor: options.danger ? brand.danger : brand.confirm,
    cancelButtonColor: brand.cancel,
    focusCancel: true,
    customClass: {
      ...baseOptions().customClass,
      confirmButton: options.danger
        ? '!inline-flex !mx-1.5 !px-5 !py-2.5 !rounded-full !text-sm !font-semibold !bg-red-600 !text-white hover:!bg-red-700'
        : baseOptions().customClass.confirmButton,
      input:
        '!rounded-2xl !border !border-black/10 !text-sm !mt-2 dark:!border-white/15 dark:!bg-white/5',
    },
    inputValidator: (value) => {
      const v = (value || '').trim()
      if (v.length < min) {
        return `Escribe al menos ${min} caracteres.`
      }
      return null
    },
  })
  if (!result.isConfirmed) return null
  return String(result.value || '').trim()
}

export async function toastSuccess(title: string, text?: string) {
  await Swal.fire({
    ...baseOptions(),
    icon: 'success',
    title,
    text,
    timer: 2200,
    showConfirmButton: false,
    timerProgressBar: true,
  })
}

export async function toastError(title: string, text?: string) {
  await Swal.fire({
    ...baseOptions(),
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Entendido',
  })
}
