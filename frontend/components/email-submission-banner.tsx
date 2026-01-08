"use client"

import { useState } from "react"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"

interface EmailSubmissionBannerProps {
    publicKey: string
    onSubmit: (email: string) => Promise<void>
}

export function EmailSubmissionBanner({ publicKey, onSubmit }: EmailSubmissionBannerProps) {
    const [email, setEmail] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const validateEmail = (email: string): { isValid: boolean; error?: string } => {
        const trimmedEmail = email.trim().toLowerCase()

        if (!trimmedEmail) {
            return { isValid: false, error: "Email is required" }
        }

        if (trimmedEmail.length > 254) {
            return { isValid: false, error: "Email is too long (max 254 characters)" }
        }

        // Comprehensive email regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

        if (!emailRegex.test(trimmedEmail)) {
            return { isValid: false, error: "Invalid email format" }
        }

        const [localPart, domain] = trimmedEmail.split('@')

        if (!localPart || localPart.length > 64) {
            return { isValid: false, error: "Email username is too long" }
        }

        if (localPart.startsWith('.') || localPart.endsWith('.')) {
            return { isValid: false, error: "Email cannot start or end with a dot" }
        }

        if (localPart.includes('..')) {
            return { isValid: false, error: "Email cannot have consecutive dots" }
        }

        if (!domain || !domain.includes('.')) {
            return { isValid: false, error: "Please include a valid domain (e.g., gmail.com)" }
        }

        // Common typo detection
        const commonTypos: { [key: string]: string } = {
            'gmial.com': 'gmail.com',
            'gmal.com': 'gmail.com',
            'gamil.com': 'gmail.com',
            'gnail.com': 'gmail.com',
            'hotmal.com': 'hotmail.com',
            'hotmial.com': 'hotmail.com',
            'outlok.com': 'outlook.com',
            'outloo.com': 'outlook.com',
            'yahooo.com': 'yahoo.com',
            'yaho.com': 'yahoo.com',
        }

        if (commonTypos[domain]) {
            return {
                isValid: false,
                error: `Did you mean ${localPart}@${commonTypos[domain]}?`
            }
        }

        return { isValid: true }
    }

    const handleSubmit = async () => {
        const validation = validateEmail(email)

        if (!validation.isValid) {
            setError(validation.error || "Please enter a valid email address")
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            await onSubmit(email)
            setSuccess(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit email")
        } finally {
            setIsSubmitting(false)
        }
    }

    if (success) {
        return (
            <div className="border border-green-500/30 bg-green-500/5 p-4 mb-6 animate-in fade-in duration-300">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-green-500 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-500">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <div>
                        <p className="font-mono text-sm text-green-500">Email submitted successfully!</p>
                        <p className="font-mono text-xs text-muted-foreground mt-1">
                            You'll receive notifications for approval requests.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="border border-accent/30 bg-gradient-to-r from-accent/5 to-purple-500/5 p-4 mb-6 transition-all duration-300">
            {!isExpanded ? (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border-2 border-accent/50 flex items-center justify-center bg-accent/10 animate-pulse">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="font-mono text-sm text-foreground flex items-center gap-2">
                                Get notified for recovery requests
                                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-accent/20 text-accent rounded-sm">
                                    Recommended
                                </span>
                            </h4>
                            <p className="font-mono text-xs text-muted-foreground mt-1">
                                Receive email notifications when someone requests your approval.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsExpanded(true)}
                        className="group inline-flex items-center gap-2 border border-accent px-4 py-2 font-mono text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all duration-200"
                    >
                        <ScrambleTextOnHover text="Add Email" as="span" duration={0.5} />
                        <BitmapChevron className="transition-transform duration-300 group-hover:rotate-45" />
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full border-2 border-accent/50 flex items-center justify-center bg-accent/10">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                    <polyline points="22,6 12,13 2,6" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="font-mono text-sm text-foreground">Stay informed about recovery requests</h4>
                                <p className="font-mono text-xs text-muted-foreground mt-1">
                                    We'll only email you when there's an approval request for your account.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Collapse"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="18 15 12 9 6 15" />
                            </svg>
                        </button>
                    </div>

                    <div className="pt-2">
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value)
                                        setError(null)
                                    }}
                                    placeholder="Enter your email address..."
                                    className="w-full bg-background border border-border/50 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                                    disabled={isSubmitting}
                                />
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !email.trim()}
                                className="group inline-flex items-center gap-2 border border-accent bg-accent px-6 py-3 font-mono text-xs uppercase tracking-widest text-background hover:bg-accent/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ScrambleTextOnHover
                                    text={isSubmitting ? "Submitting..." : "Submit"}
                                    as="span"
                                    duration={0.5}
                                />
                                {!isSubmitting && (
                                    <BitmapChevron className="transition-transform duration-300 group-hover:rotate-45" />
                                )}
                            </button>
                        </div>
                        {error && (
                            <p className="font-mono text-xs text-red-500 mt-2">{error}</p>
                        )}
                        <p className="font-mono text-[10px] text-muted-foreground mt-3">
                            📧 Your email is stored securely and only used for recovery-related notifications.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
