"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatedNoise } from "@/components/animated-noise"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"
import { DeployUtil, CLPublicKey } from "casper-js-sdk"
import {
    connectWallet,
    disconnectWallet,
    isWalletConnected,
    getActivePublicKey,
    formatPublicKey,
    isCasperWalletInstalled,
    getProvider
} from "@/lib/casper-wallet"
import {
    approveRecovery,
    submitDeploy,
    getDeployStatus,
    getRecoveriesForGuardian,
    GuardianRecovery,
    checkUserEmail,
    submitUserEmail,
    getMultisigDeploy,
    addSignatureToDeploy,
    sendMultisigDeploy
} from "@/lib/api"
import { EmailSubmissionBanner } from "@/components/email-submission-banner"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

type ViewMode = "user" | "guardian"
type RecoveryPhase = "initiated" | "approvals" | "waiting" | "finalized"

interface GuardianStatus {
    publicKey: string
    approved: boolean
    approvedAt?: string
}

interface RecoveryProgress {
    recoveryId: string
    currentPhase: RecoveryPhase
    targetAccount: string
    newPublicKey: string
    initiatedAt: string
    guardians: GuardianStatus[]
    waitingPeriodEnds?: string
}

const phases: { id: RecoveryPhase; label: string; description: string }[] = [
    { id: "initiated", label: "Initiated", description: "Recovery request submitted" },
    { id: "approvals", label: "Approvals", description: "Guardians reviewing request" },
    { id: "waiting", label: "Waiting Period", description: "30-day security delay" },
    { id: "finalized", label: "Complete", description: "Account recovered" },
]

function PhaseCheckpoint({
    phase,
    isActive,
    isComplete,
    isLast
}: {
    phase: typeof phases[0]
    isActive: boolean
    isComplete: boolean
    isLast: boolean
}) {
    return (
        <div className="flex items-start gap-4 relative">
            {/* Vertical connector line */}
            {!isLast && (
                <div
                    className={`absolute left-[15px] top-[32px] w-[2px] h-[calc(100%+16px)] ${isComplete ? "bg-green-500" : "bg-border/30"
                        }`}
                />
            )}

            {/* Checkpoint box */}
            <div
                className={`relative z-10 w-8 h-8 flex items-center justify-center border-2 transition-all duration-300 ${isComplete
                    ? "bg-green-500/20 border-green-500 text-green-500"
                    : isActive
                        ? "bg-accent/20 border-accent text-accent animate-pulse"
                        : "bg-background border-border/50 text-muted-foreground"
                    }`}
            >
                {isComplete ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <span className="font-mono text-xs">{phases.findIndex(p => p.id === phase.id) + 1}</span>
                )}
            </div>

            {/* Phase info */}
            <div className="flex-1 pb-8">
                <h4 className={`font-mono text-sm uppercase tracking-widest ${isComplete ? "text-green-500" : isActive ? "text-accent" : "text-muted-foreground"
                    }`}>
                    {phase.label}
                </h4>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                    {phase.description}
                </p>
            </div>
        </div>
    )
}

function GuardianApprovalCard({ guardian, index }: { guardian: GuardianStatus; index: number }) {
    return (
        <div className={`border p-4 transition-all duration-300 ${guardian.approved
            ? "border-green-500/50 bg-green-500/5"
            : "border-border/30 bg-background"
            }`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 flex items-center justify-center border ${guardian.approved
                        ? "border-green-500 text-green-500 bg-green-500/10"
                        : "border-border/50 text-muted-foreground"
                        }`}>
                        {guardian.approved ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <span className="font-mono text-xs">{index + 1}</span>
                        )}
                    </div>
                    <div>
                        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                            Guardian {index + 1}
                        </p>
                        <p className="font-mono text-xs text-foreground/80 mt-1">
                            {formatPublicKey(guardian.publicKey, 10, 8)}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <span className={`font-mono text-xs uppercase tracking-widest ${guardian.approved ? "text-green-500" : "text-yellow-500"
                        }`}>
                        {guardian.approved ? "Approved" : "Pending"}
                    </span>
                    {guardian.approvedAt && (
                        <p className="font-mono text-[10px] text-muted-foreground mt-1">
                            {new Date(guardian.approvedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function DashboardPage() {
    const sectionRef = useRef<HTMLElement>(null)
    const formRef = useRef<HTMLDivElement>(null)
    const [viewMode, setViewMode] = useState<ViewMode>("user")
    const [isConnected, setIsConnected] = useState(false)
    const [publicKey, setPublicKey] = useState("")
    const [isConnecting, setIsConnecting] = useState(false)
    const [connectionError, setConnectionError] = useState<string | null>(null)

    // Guardian approval state
    const [recoveryId, setRecoveryId] = useState("")
    const [recoveryIdError, setRecoveryIdError] = useState<string | null>(null)
    const [approvalStatus, setApprovalStatus] = useState<"idle" | "pending" | "submitted" | "confirmed" | "signing_multisig" | "saving_multisig" | "sending">("idle")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [deployHash, setDeployHash] = useState<string | null>(null)
    const [multisigResult, setMultisigResult] = useState<{ signatureCount: number; thresholdMet: boolean } | null>(null)
    const [selectedRecovery, setSelectedRecovery] = useState<GuardianRecovery | null>(null)

    // Guardian recoveries auto-fetched
    const [guardianRecoveries, setGuardianRecoveries] = useState<GuardianRecovery[]>([])
    const [pendingRecoveries, setPendingRecoveries] = useState<GuardianRecovery[]>([])
    const [approvedRecoveries, setApprovedRecoveries] = useState<GuardianRecovery[]>([])
    const [isLoadingGuardianRecoveries, setIsLoadingGuardianRecoveries] = useState(false)
    const [guardianRecoveriesError, setGuardianRecoveriesError] = useState<string | null>(null)

    // User recovery progress state
    const [userRecoveryId, setUserRecoveryId] = useState("")
    const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress | null>(null)
    const [isLoadingProgress, setIsLoadingProgress] = useState(false)
    const [progressError, setProgressError] = useState<string | null>(null)

    // Email notification state
    const [hasEmail, setHasEmail] = useState<boolean | null>(null)
    const [showEmailBanner, setShowEmailBanner] = useState(false)
    const [isCheckingEmail, setIsCheckingEmail] = useState(false)

    useEffect(() => {
        const checkExistingConnection = async () => {
            try {
                const connected = await isWalletConnected()
                if (connected) {
                    const key = await getActivePublicKey()
                    if (key) {
                        setIsConnected(true)
                        setPublicKey(key)
                    }
                }
            } catch (error) {
                console.error("Error checking wallet connection:", error)
            }
        }

        if (typeof window !== 'undefined') {
            const timer = setTimeout(checkExistingConnection, 500)
            return () => clearTimeout(timer)
        }
    }, [])

    useEffect(() => {
        if (!sectionRef.current || !formRef.current) return

        const ctx = gsap.context(() => {
            gsap.from(formRef.current, {
                y: 60,
                opacity: 0,
                duration: 1.2,
                ease: "power3.out",
            })
        }, sectionRef)

        return () => ctx.revert()
    }, [])

    // Poll for recovery progress
    useEffect(() => {
        if (viewMode !== "user" || !userRecoveryId || !recoveryProgress) return

        const pollProgress = async () => {
            try {
                const result = await getDeployStatus(userRecoveryId)
                if (result.success && result.data) {
                    // Update progress based on deploy status
                    setRecoveryProgress(prev => {
                        if (!prev) return null
                        const approvedCount = prev.guardians.filter(g => g.approved).length
                        let newPhase: RecoveryPhase = prev.currentPhase

                        if (result.data?.status === "success" && approvedCount >= prev.guardians.length) {
                            newPhase = "waiting"
                        }

                        return { ...prev, currentPhase: newPhase }
                    })
                }
            } catch (error) {
                console.error("Error polling recovery progress:", error)
            }
        }

        const interval = setInterval(pollProgress, 10000)
        return () => clearInterval(interval)
    }, [viewMode, userRecoveryId, recoveryProgress])

    // Auto-fetch recoveries for guardian when wallet connects and in guardian view
    useEffect(() => {
        if (!isConnected || !publicKey || viewMode !== "guardian") return

        const fetchGuardianRecoveries = async () => {
            setIsLoadingGuardianRecoveries(true)
            setGuardianRecoveriesError(null)

            try {
                const result = await getRecoveriesForGuardian(publicKey)
                if (result.success && result.data) {
                    const recoveries = result.data.recoveries
                    setGuardianRecoveries(recoveries)
                    setPendingRecoveries(recoveries.filter(r => !r.alreadyApproved && !r.isApproved))
                    setApprovedRecoveries(recoveries.filter(r => r.alreadyApproved))
                } else {
                    setGuardianRecoveriesError(result.error || 'Failed to fetch recoveries')
                }
            } catch (error) {
                setGuardianRecoveriesError('Failed to fetch recoveries')
            } finally {
                setIsLoadingGuardianRecoveries(false)
            }
        }

        fetchGuardianRecoveries()
        const interval = setInterval(fetchGuardianRecoveries, 15000)
        return () => clearInterval(interval)
    }, [isConnected, publicKey, viewMode])

    // Poll for deploy status for approval
    useEffect(() => {
        if (!deployHash || approvalStatus === "confirmed") return

        const pollStatus = async () => {
            try {
                const result = await getDeployStatus(deployHash)
                if (result.success && result.data) {
                    if (result.data.status === "success") {
                        setApprovalStatus("confirmed")
                    } else if (result.data.status === "failed") {
                        setSubmitError("Approval deploy failed on-chain")
                        setApprovalStatus("idle")
                    }
                }
            } catch (error) {
                console.error("Error polling deploy status:", error)
            }
        }

        const interval = setInterval(pollStatus, 5000)
        return () => clearInterval(interval)
    }, [deployHash, approvalStatus])

    // Check if user has submitted email when wallet connects
    useEffect(() => {
        if (!isConnected || !publicKey) {
            setHasEmail(null)
            setShowEmailBanner(false)
            return
        }

        const checkEmail = async () => {
            setIsCheckingEmail(true)
            try {
                const result = await checkUserEmail(publicKey)
                if (result.success && result.data) {
                    setHasEmail(result.data.hasEmail)
                    setShowEmailBanner(!result.data.hasEmail)
                }
            } catch (error) {
                console.error('Error checking user email:', error)
            } finally {
                setIsCheckingEmail(false)
            }
        }

        checkEmail()
    }, [isConnected, publicKey])

    const handleEmailSubmit = async (email: string) => {
        const result = await submitUserEmail(publicKey, email)
        if (!result.success) {
            throw new Error(result.error || 'Failed to submit email')
        }
        setHasEmail(true)
        setShowEmailBanner(false)
    }

    const handleConnectWallet = async () => {
        setIsConnecting(true)
        setConnectionError(null)

        try {
            if (!isCasperWalletInstalled()) {
                setConnectionError("Casper Wallet extension is not installed. Please install it from casperwallet.io")
                window.open("https://www.casperwallet.io/", "_blank")
                return
            }

            const key = await connectWallet()
            if (key) {
                setIsConnected(true)
                setPublicKey(key)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet"
            setConnectionError(errorMessage)
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDisconnect = async () => {
        try {
            const disconnected = await disconnectWallet()
            if (disconnected) {
                setIsConnected(false)
                setPublicKey("")
                setConnectionError(null)
            }
        } catch (error) {
            console.error("Disconnect error:", error)
        }
    }

    const validateRecoveryId = (value: string): string | null => {
        if (!value.trim()) return null
        if (!/^\d+$/.test(value.trim())) {
            return "Recovery ID must be a positive number"
        }
        return null
    }

    const handleApproveRecovery = async (recovery?: GuardianRecovery) => {
        const targetRecoveryId = recovery?.recoveryId || recoveryId.trim()

        if (!targetRecoveryId) {
            setSubmitError("Please enter a recovery ID or select a pending recovery")
            return
        }

        if (!recovery) {
            const validationError = validateRecoveryId(targetRecoveryId)
            if (validationError) {
                setSubmitError(validationError)
                return
            }
        }

        setIsSubmitting(true)
        setSubmitError(null)
        setApprovalStatus("pending")
        setSelectedRecovery(recovery || null)
        setMultisigResult(null)

        try {
            const provider = getProvider()
            if (!provider) {
                throw new Error("Casper Wallet not available")
            }

            const pubKey = CLPublicKey.fromHex(publicKey)
            const algorithmTag = pubKey.isEd25519() ? '01' : '02'

            // ============================================================================
            // STEP 1: Fetch and Sign Multi-Sig Deploy (Off-Chain)
            // ============================================================================
            console.log("Step 1: Fetching multi-sig deploy for recovery:", targetRecoveryId)
            setApprovalStatus("signing_multisig")

            // Retry logic for fetching multi-sig deploy
            let multisigData = await getMultisigDeploy(targetRecoveryId)
            let retries = 0
            while (!multisigData.success && retries < 3) {
                console.log(`Retry ${retries + 1} fetching multi-sig deploy...`)
                await new Promise(resolve => setTimeout(resolve, 2000))
                multisigData = await getMultisigDeploy(targetRecoveryId)
                retries++
            }

            console.log("Multi-sig deploy data:", multisigData)

            if (!multisigData.success) {
                throw new Error(`Multi-sig deploy not found. Please ensure recovery was initiated properly. Error: ${multisigData.error || 'Not found'}`)
            }

            if (!multisigData.data?.deployJson) {
                throw new Error("Multi-sig deploy exists but has no deploy data. This recovery may need to be re-initiated.")
            }

            const multisigDeployJson = multisigData.data.deployJson
            // Ensure it's a string for the wallet
            const multisigDeployString = typeof multisigDeployJson === 'string'
                ? multisigDeployJson
                : JSON.stringify(multisigDeployJson)

            console.log("Signing multi-sig deploy...")
            const multisigResponse = await provider.sign(multisigDeployString, publicKey)

            if (multisigResponse.cancelled) {
                throw new Error("Multi-sig deploy signing cancelled by user")
            }

            if (!multisigResponse.signatureHex) {
                throw new Error("Failed to get signature for multi-sig deploy")
            }

            // Reconstruct and add signature to multi-sig deploy
            const multisigOriginalJson = typeof multisigDeployJson === 'string'
                ? JSON.parse(multisigDeployJson)
                : multisigDeployJson
            const multisigDeploy = DeployUtil.deployFromJson(multisigOriginalJson).unwrap()

            const multisigApproval = new DeployUtil.Approval()
            multisigApproval.signer = pubKey.toHex()
            multisigApproval.signature = algorithmTag + multisigResponse.signatureHex
            multisigDeploy.approvals.push(multisigApproval)

            const signedMultisigDeploy = DeployUtil.deployToJson(multisigDeploy)

            // ============================================================================
            // STEP 2: Save Signed Multi-Sig Deploy
            // ============================================================================
            console.log("Step 2: Saving signed multi-sig deploy...")
            setApprovalStatus("saving_multisig")

            const addSigResult = await addSignatureToDeploy(targetRecoveryId, signedMultisigDeploy)

            if (!addSigResult.success) {
                throw new Error(addSigResult.error || "Failed to save multi-sig signature")
            }

            setMultisigResult(addSigResult.data || null)
            console.log(`Multi-sig signature saved. Count: ${addSigResult.data?.signatureCount}, Threshold met: ${addSigResult.data?.thresholdMet}`)

            // ============================================================================
            // STEP 3: On-Chain Contract Approval
            // ============================================================================
            console.log("Step 3: Getting approval deploy for recovery:", targetRecoveryId)
            setApprovalStatus("pending")

            const approveResult = await approveRecovery(publicKey, targetRecoveryId)

            if (!approveResult.success || !approveResult.data?.deployJson) {
                throw new Error(approveResult.error || "Failed to build approval deploy")
            }

            // Sign the contract approval deploy
            const deployJson = approveResult.data.deployJson
            const deployString = typeof deployJson === 'string' ? deployJson : JSON.stringify(deployJson)

            console.log("Signing contract approval deploy...")
            const response = await provider.sign(deployString, publicKey)

            if (response.cancelled) {
                throw new Error("Sign request cancelled by user")
            }

            const signatureHex = response.signatureHex
            if (!signatureHex) {
                throw new Error("Failed to get signature from wallet")
            }

            // Reconstruct and sign the deploy
            const originalDeployJson = typeof deployJson === 'string' ? JSON.parse(deployJson) : deployJson
            const deploy = DeployUtil.deployFromJson(originalDeployJson).unwrap()

            const approval = new DeployUtil.Approval()
            approval.signer = pubKey.toHex()
            approval.signature = algorithmTag + signatureHex
            deploy.approvals.push(approval)

            // Submit contract approval deploy
            const signedDeployJson = DeployUtil.deployToJson(deploy)
            const submitResult = await submitDeploy(JSON.stringify(signedDeployJson))

            if (!submitResult.success) {
                throw new Error(submitResult.error || "Failed to submit approval deploy")
            }

            setDeployHash(submitResult.data?.deployHash || null)
            setApprovalStatus("submitted")

            // Step 4: If threshold is met, offer to send the deploy
            if (addSigResult.data?.thresholdMet) {
                console.log("Threshold met! Ready to send final deploy.")
            }

            // Refresh recoveries
            const result = await getRecoveriesForGuardian(publicKey)
            if (result.success && result.data) {
                const recoveries = result.data.recoveries
                setGuardianRecoveries(recoveries)
                setPendingRecoveries(recoveries.filter(r => !r.alreadyApproved && !r.isApproved))
                setApprovedRecoveries(recoveries.filter(r => r.alreadyApproved))
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to approve recovery"
            setSubmitError(errorMessage)
            if (approvalStatus !== "submitted" && approvalStatus !== "confirmed") {
                setApprovalStatus("idle")
            } else {
                console.error("Failed during approval process:", error)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSendFinalDeploy = async () => {
        const targetRecoveryId = selectedRecovery?.recoveryId || recoveryId.trim()
        if (!targetRecoveryId) return

        setIsSubmitting(true)
        setSubmitError(null)
        setApprovalStatus("sending")

        try {
            console.log("Sending final multi-sig deploy for recovery:", targetRecoveryId)
            const sendResult = await sendMultisigDeploy(targetRecoveryId)

            if (!sendResult.success) {
                throw new Error(sendResult.error || "Failed to send multi-sig deploy")
            }

            console.log("Multi-sig deploy sent! Hash:", sendResult.data?.deployHash)
            setDeployHash(sendResult.data?.deployHash || null)
            alert("Recovery multi-sig deploy sent to network successfully!")

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to send final deploy"
            setSubmitError(errorMessage)
        } finally {
            setIsSubmitting(false)
            setApprovalStatus("confirmed")
        }
    }

    const handleTrackRecovery = async () => {
        if (!userRecoveryId.trim()) {
            setProgressError("Please enter a Recovery ID")
            return
        }

        setIsLoadingProgress(true)
        setProgressError(null)

        try {
            const result = await getDeployStatus(userRecoveryId.trim())

            // Mock guardian data - in production this would come from the backend
            const mockGuardians: GuardianStatus[] = [
                {
                    publicKey: "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef01",
                    approved: result.success && result.data?.status === "success",
                    approvedAt: result.success ? new Date().toISOString() : undefined
                },
                {
                    publicKey: "02b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0102",
                    approved: false
                },
                {
                    publicKey: "03c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef010203",
                    approved: false
                },
            ]

            const approvedCount = mockGuardians.filter(g => g.approved).length
            let currentPhase: RecoveryPhase = "initiated"

            if (result.success && result.data?.status === "success") {
                currentPhase = approvedCount >= mockGuardians.length ? "waiting" : "approvals"
            } else if (result.success) {
                currentPhase = "approvals"
            }

            setRecoveryProgress({
                recoveryId: userRecoveryId.trim(),
                currentPhase,
                targetAccount: "Pending verification",
                newPublicKey: "Pending verification",
                initiatedAt: new Date().toISOString(),
                guardians: mockGuardians,
            })
        } catch (error) {
            setProgressError("Failed to fetch recovery status. Please verify the Recovery ID.")
        } finally {
            setIsLoadingProgress(false)
        }
    }

    const getPhaseIndex = (phase: RecoveryPhase) => phases.findIndex(p => p.id === phase)
    const approvedCount = recoveryProgress?.guardians.filter(g => g.approved).length ?? 0
    const totalGuardians = recoveryProgress?.guardians.length ?? 0

    return (
        <main ref={sectionRef} className="relative min-h-screen">
            <AnimatedNoise opacity={0.03} />

            {/* Navigation */}
            <nav className="relative z-10 border-b border-border/30 px-6 md:px-28 py-6">
                <div className="flex items-center justify-between">
                    <a href="/" className="font-[(--font-bebas)] text-2xl tracking-tight hover:text-accent transition-colors">
                        SENTINELX
                    </a>
                    <div className="flex items-center gap-6">
                        <a href="/#how-it-works" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            How It Works
                        </a>
                        <a href="/setup" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Setup
                        </a>
                        <a href="/recovery" className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-colors">
                            Recovery
                        </a>
                        <a href="/dashboard" className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
                            Dashboard
                        </a>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <section className="relative z-10 px-6 md:px-28 py-16 md:py-24">
                <div className="max-w-4xl">
                    {/* Header */}
                    <div className="mb-12">
                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Dashboard</span>
                        <h1 className="mt-4 font-[(--font-bebas)] text-5xl md:text-7xl tracking-tight">
                            {viewMode === "user" ? "RECOVERY STATUS" : "APPROVALS"}
                        </h1>
                        <p className="mt-6 max-w-2xl font-mono text-sm text-muted-foreground leading-relaxed">
                            {viewMode === "user"
                                ? "Track the progress of your account recovery. Monitor guardian approvals and recovery status."
                                : "As a protector, you can approve recovery requests here. Each approval adds to the threshold."}
                        </p>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="mb-12 border border-border/30 p-4 inline-flex gap-2">
                        <button
                            onClick={() => setViewMode("user")}
                            className={`px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all duration-200 ${viewMode === "user"
                                ? "bg-accent text-background"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            I'm Recovering
                        </button>
                        <button
                            onClick={() => setViewMode("guardian")}
                            className={`px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all duration-200 ${viewMode === "guardian"
                                ? "bg-accent text-background"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            I'm a Guardian
                        </button>
                    </div>

                    {/* Form */}
                    <div ref={formRef} className="space-y-12">
                        {/* Wallet Connection */}
                        <div className="border border-border/30 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-2">
                                        {viewMode === "user" ? "Your Wallet" : "Protector Wallet"}
                                    </h3>
                                    {isConnected ? (
                                        <div>
                                            <p className="font-mono text-sm text-accent">
                                                Connected: {formatPublicKey(publicKey)}
                                            </p>
                                            <p className="font-mono text-[10px] text-muted-foreground mt-1 break-all max-w-md">
                                                {publicKey}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="font-mono text-sm text-muted-foreground">
                                            {isConnecting ? "Connecting..." : "Not connected"}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    {isConnected ? (
                                        <button
                                            onClick={handleDisconnect}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-red-500 hover:text-red-500 transition-all duration-200"
                                        >
                                            <ScrambleTextOnHover text="Disconnect" as="span" duration={0.6} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleConnectWallet}
                                            disabled={isConnecting}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ScrambleTextOnHover text={isConnecting ? "Connecting..." : "Connect Wallet"} as="span" duration={0.6} />
                                            {!isConnecting && <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {connectionError && (
                                <div className="p-4 border border-red-500/30 bg-red-500/5">
                                    <p className="font-mono text-xs text-red-500">{connectionError}</p>
                                </div>
                            )}
                        </div>

                        {/* Email Submission Banner - Show for connected users without email */}
                        {isConnected && showEmailBanner && !isCheckingEmail && (
                            <EmailSubmissionBanner
                                publicKey={publicKey}
                                onSubmit={handleEmailSubmit}
                            />
                        )}

                        {/* USER VIEW */}
                        {viewMode === "user" && (
                            <>
                                {/* Track Recovery Form */}
                                <div className="border border-border/30 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                                        Track Your Recovery
                                    </h3>
                                    <div className="space-y-2">
                                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID / Deploy Hash
                                        </label>
                                        <input
                                            type="text"
                                            value={userRecoveryId}
                                            onChange={(e) => setUserRecoveryId(e.target.value)}
                                            placeholder="Enter your recovery ID..."
                                            className="w-full bg-transparent border border-border/30 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors"
                                        />
                                        <p className="font-mono text-xs text-muted-foreground">
                                            The deploy hash you received when initiating recovery
                                        </p>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-border/30">
                                        {progressError && (
                                            <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                                                <p className="font-mono text-xs text-red-500">{progressError}</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleTrackRecovery}
                                            disabled={!userRecoveryId.trim() || isLoadingProgress}
                                            className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ScrambleTextOnHover
                                                text={isLoadingProgress ? "Loading..." : "Track Recovery"}
                                                as="span"
                                                duration={0.6}
                                            />
                                            {!isLoadingProgress && (
                                                <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Recovery Progress Display */}
                                {recoveryProgress && (
                                    <>
                                        {/* Phase Progress - Checkpoint Style */}
                                        <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                                            <div className="flex items-center justify-between mb-8">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-accent">
                                                    Recovery Progress
                                                </h3>
                                                <span className="font-mono text-xs text-foreground/60">
                                                    Phase {getPhaseIndex(recoveryProgress.currentPhase) + 1} of {phases.length}
                                                </span>
                                            </div>

                                            {/* Checkpoint Timeline */}
                                            <div className="pl-2">
                                                {phases.map((phase, index) => (
                                                    <PhaseCheckpoint
                                                        key={phase.id}
                                                        phase={phase}
                                                        isActive={phase.id === recoveryProgress.currentPhase}
                                                        isComplete={getPhaseIndex(phase.id) < getPhaseIndex(recoveryProgress.currentPhase) ||
                                                            (phase.id === "finalized" && recoveryProgress.currentPhase === "finalized")}
                                                        isLast={index === phases.length - 1}
                                                    />
                                                ))}
                                            </div>

                                            {/* Recovery Details */}
                                            <div className="mt-6 pt-6 border-t border-accent/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                        Recovery ID
                                                    </span>
                                                    <p className="font-mono text-xs text-foreground/80 mt-1 break-all">
                                                        {recoveryProgress.recoveryId}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                        Initiated
                                                    </span>
                                                    <p className="font-mono text-xs text-foreground/80 mt-1">
                                                        {new Date(recoveryProgress.initiatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Guardian Approvals Section */}
                                        <div className="border border-border/30 p-6 md:p-8">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground">
                                                    Guardian Approvals
                                                </h3>
                                                <span className={`font-mono text-xs uppercase tracking-widest ${approvedCount === totalGuardians ? "text-green-500" : "text-accent"
                                                    }`}>
                                                    {approvedCount} / {totalGuardians} Approved
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="mb-6">
                                                <div className="h-2 bg-border/30 overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${approvedCount === totalGuardians ? "bg-green-500" : "bg-accent"
                                                            }`}
                                                        style={{ width: `${(approvedCount / totalGuardians) * 100}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Guardian Cards */}
                                            <div className="space-y-3">
                                                {recoveryProgress.guardians.map((guardian, index) => (
                                                    <GuardianApprovalCard
                                                        key={guardian.publicKey}
                                                        guardian={guardian}
                                                        index={index}
                                                    />
                                                ))}
                                            </div>

                                            {/* Share Recovery ID Prompt */}
                                            {approvedCount < totalGuardians && (
                                                <div className="mt-6 p-4 border border-yellow-500/30 bg-yellow-500/5">
                                                    <p className="font-mono text-xs text-yellow-500">
                                                        ⚠ Share your Recovery ID with pending guardians so they can approve your request.
                                                    </p>
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <code className="flex-1 font-mono text-[10px] text-foreground/80 bg-background/50 px-3 py-2 break-all">
                                                            {recoveryProgress.recoveryId}
                                                        </code>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(recoveryProgress.recoveryId)}
                                                            className="px-3 py-2 border border-border/30 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                                        >
                                                            Copy
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Waiting Period Info (if applicable) */}
                                        {recoveryProgress.currentPhase === "waiting" && (
                                            <div className="border border-accent/30 bg-accent/5 p-6 md:p-8">
                                                <h3 className="font-mono text-xs uppercase tracking-widest text-accent mb-4">
                                                    Waiting Period Active
                                                </h3>
                                                <p className="font-mono text-sm text-foreground/80 mb-4">
                                                    All guardians have approved. The 30-day security waiting period is now active.
                                                </p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                            Started
                                                        </span>
                                                        <p className="font-mono text-xs text-foreground/80 mt-1">
                                                            {new Date().toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                            Ends
                                                        </span>
                                                        <p className="font-mono text-xs text-foreground/80 mt-1">
                                                            {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Info Panel */}
                                <div className="border border-border/30 p-6 md:p-8">
                                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-4">
                                        About Recovery Tracking
                                    </h3>
                                    <ul className="space-y-3">
                                        <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                            <span className="text-accent">01</span>
                                            <span>Monitor the status of your recovery request in real-time</span>
                                        </li>
                                        <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                            <span className="text-accent">02</span>
                                            <span>See which guardians have approved and who is still pending</span>
                                        </li>
                                        <li className="font-mono text-sm text-foreground/80 flex items-start gap-3">
                                            <span className="text-accent">03</span>
                                            <span>Track the security waiting period once approvals are complete</span>
                                        </li>
                                    </ul>
                                </div>
                            </>
                        )}

                        {/* GUARDIAN VIEW */}
                        {viewMode === "guardian" && isConnected && approvalStatus === "idle" && (
                            <div className="border border-border/30 p-6 md:p-8">
                                <h3 className="font-mono text-xs uppercase tracking-widest text-foreground mb-8">
                                    Recovery Approval
                                </h3>

                                {/* Pending Recoveries Section */}
                                {isLoadingGuardianRecoveries ? (
                                    <div className="flex items-center gap-3 mb-8 p-4 border border-border/20 bg-background/50">
                                        <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                                        <span className="font-mono text-xs text-muted-foreground">Loading pending recoveries...</span>
                                    </div>
                                ) : pendingRecoveries.length > 0 ? (
                                    <div className="mb-8 space-y-4">
                                        <h4 className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                            Pending Recoveries ({pendingRecoveries.length})
                                        </h4>
                                        <div className="space-y-3">
                                            {pendingRecoveries.map((recovery) => {
                                                const progressPercent = (recovery.approvalCount / recovery.threshold) * 100
                                                return (
                                                    <div
                                                        key={recovery.recoveryId}
                                                        className="p-4 border border-border/30 bg-background/30 hover:border-accent/30 transition-colors"
                                                    >
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                            <div className="space-y-2 flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-xs text-accent">ID: {recovery.recoveryId}</span>
                                                                    <span className="font-mono text-[10px] text-muted-foreground bg-accent/10 px-2 py-0.5">
                                                                        {recovery.approvalCount}/{recovery.threshold} approvals
                                                                    </span>
                                                                </div>
                                                                <div className="font-mono text-[10px] text-muted-foreground truncate">
                                                                    Target: {recovery.targetAccount}
                                                                </div>
                                                                {recovery.newKey && (
                                                                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                                                                        New Key: {recovery.newKey}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => handleApproveRecovery(recovery)}
                                                                disabled={isSubmitting}
                                                                className="shrink-0 inline-flex items-center gap-2 border border-green-500/30 bg-green-500/5 px-4 py-2 font-mono text-xs uppercase tracking-widest text-green-500 hover:bg-green-500/10 hover:border-green-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Approve
                                                            </button>
                                                        </div>
                                                        {/* Progress Bar */}
                                                        <div className="mt-4">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                                                    Approval Progress
                                                                </span>
                                                                <span className="font-mono text-[10px] text-accent">
                                                                    {Math.round(progressPercent)}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-border/30 overflow-hidden">
                                                                <div
                                                                    className="h-full bg-accent transition-all duration-500"
                                                                    style={{ width: `${progressPercent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-8 p-4 border border-border/20 bg-background/50">
                                        <p className="font-mono text-xs text-muted-foreground">
                                            No pending recoveries found for your account.
                                        </p>
                                    </div>
                                )}

                                {/* Already Approved Recoveries Section */}
                                {approvedRecoveries.length > 0 && (
                                    <div className="mb-8 space-y-4">
                                        <h4 className="font-mono text-[10px] uppercase tracking-[0.3em] text-green-500">
                                            Already Approved by You ({approvedRecoveries.length})
                                        </h4>
                                        <div className="space-y-3">
                                            {approvedRecoveries.map((recovery) => {
                                                const progressPercent = (recovery.approvalCount / recovery.threshold) * 100
                                                const isComplete = recovery.approvalCount >= recovery.threshold
                                                return (
                                                    <div
                                                        key={recovery.recoveryId}
                                                        className="p-4 border border-green-500/20 bg-green-500/5"
                                                    >
                                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                            <div className="space-y-2 flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono text-xs text-green-500">ID: {recovery.recoveryId}</span>
                                                                    <span className="font-mono text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5">
                                                                        {recovery.approvalCount}/{recovery.threshold} approvals
                                                                    </span>
                                                                    {recovery.isApproved && (
                                                                        <span className="font-mono text-[10px] text-green-500 bg-green-500/20 px-2 py-0.5">
                                                                            Ready to Execute
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="font-mono text-[10px] text-muted-foreground truncate">
                                                                    Target: {recovery.targetAccount}
                                                                </div>
                                                                {recovery.newKey && (
                                                                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                                                                        New Key: {recovery.newKey}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="shrink-0 inline-flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest text-green-500">
                                                                ✓ Approved
                                                            </div>
                                                        </div>
                                                        {/* Progress Bar */}
                                                        <div className="mt-4">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                                                                    Approval Progress
                                                                </span>
                                                                <span className={`font-mono text-[10px] ${isComplete ? "text-green-500" : "text-accent"}`}>
                                                                    {Math.round(progressPercent)}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-border/30 overflow-hidden">
                                                                <div
                                                                    className={`h-full transition-all duration-500 ${isComplete ? "bg-green-500" : "bg-accent"}`}
                                                                    style={{ width: `${progressPercent}%` }}
                                                                />
                                                            </div>
                                                            {isComplete && (
                                                                <p className="font-mono text-[10px] text-green-500 mt-2">
                                                                    ✓ All guardians have approved. Recovery can be executed.
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Manual Recovery ID Input */}
                                <div className="space-y-6">
                                    <div className="border-t border-border/30 pt-6">
                                        <h4 className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
                                            Or Enter Recovery ID Manually
                                        </h4>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID
                                        </label>
                                        <input
                                            type="text"
                                            value={recoveryId}
                                            onChange={(e) => {
                                                setRecoveryId(e.target.value)
                                                setRecoveryIdError(validateRecoveryId(e.target.value))
                                            }}
                                            placeholder="Enter recovery ID (e.g., 1)"
                                            className={`w-full bg-transparent border px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none transition-colors ${recoveryIdError ? "border-red-500/50" : "border-border/30"
                                                }`}
                                        />
                                        {recoveryIdError && (
                                            <p className="font-mono text-xs text-red-500">{recoveryIdError}</p>
                                        )}
                                        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                                            The recovery ID from the initiation step
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-8 pt-8 border-t border-border/30">
                                    {submitError && (
                                        <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5">
                                            <p className="font-mono text-xs text-red-500">{submitError}</p>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleApproveRecovery()}
                                        disabled={!recoveryId.trim() || isSubmitting || !!recoveryIdError}
                                        className="group inline-flex items-center gap-3 border border-foreground/20 px-8 py-4 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ScrambleTextOnHover
                                            text={isSubmitting ? "Signing..." : "Approve Recovery"}
                                            as="span"
                                            duration={0.6}
                                        />
                                        {!isSubmitting && (
                                            <BitmapChevron className="transition-transform duration-400 ease-in-out group-hover:rotate-45" />
                                        )}
                                    </button>
                                    <p className="mt-4 font-mono text-xs text-muted-foreground">
                                        {isSubmitting ? "Please sign in Casper Wallet..." : "Your approval will be recorded on-chain"}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Approval Status Display */}
                        {viewMode === "guardian" && isConnected && (approvalStatus === "submitted" || approvalStatus === "signing_multisig" || approvalStatus === "saving_multisig" || approvalStatus === "sending" || approvalStatus === "confirmed") && (
                            <div className={`border p-6 md:p-8 ${approvalStatus === "confirmed" ? "border-green-500/30 bg-green-500/5" : "border-accent/30 bg-accent/5"
                                }`}>
                                <h3 className={`font-mono text-xs uppercase tracking-widest mb-4 ${approvalStatus === "confirmed" ? "text-green-500" : "text-accent"
                                    }`}>
                                    {approvalStatus === "confirmed" ? "Approval Complete ✓" :
                                        approvalStatus === "submitted" ? "Contract Approval Submitted ⏳" :
                                            approvalStatus === "signing_multisig" ? "Signing Multi-Sig Deploy 🔐" :
                                                approvalStatus === "saving_multisig" ? "Saving Signature 💾" :
                                                    approvalStatus === "sending" ? "Sending Final Deploy 📤" : "Processing..."}
                                </h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-1">
                                        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                            Recovery ID
                                        </span>
                                        <span className="font-mono text-xs text-foreground/80">
                                            {selectedRecovery?.recoveryId || recoveryId}
                                        </span>
                                    </div>
                                    {deployHash && (
                                        <div className="grid grid-cols-1 gap-1">
                                            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                Deploy Hash
                                            </span>
                                            <span className="font-mono text-xs text-foreground/80 break-all">{deployHash}</span>
                                        </div>
                                    )}

                                    {/* Progress Steps for multi-sig */}
                                    {(approvalStatus === "signing_multisig" || approvalStatus === "saving_multisig") && (
                                        <div className="pt-4 border-t border-accent/30">
                                            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">Progress</p>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-green-500" />
                                                    <span className="font-mono text-xs text-foreground/70">Contract approval submitted</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${approvalStatus === "signing_multisig" ? "bg-accent animate-pulse" : "bg-green-500"}`} />
                                                    <span className="font-mono text-xs text-foreground/70">Sign multi-sig deploy</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${approvalStatus === "saving_multisig" ? "bg-accent animate-pulse" : "bg-muted-foreground/30"}`} />
                                                    <span className="font-mono text-xs text-foreground/70">Save signature to database</span>
                                                </div>
                                            </div>
                                            <p className="mt-4 font-mono text-xs text-muted-foreground">
                                                {approvalStatus === "signing_multisig" ? "Please sign the multi-sig deploy in Casper Wallet..." : "Saving signature..."}
                                            </p>
                                        </div>
                                    )}

                                    {/* Multi-sig result and send button */}
                                    {approvalStatus === "confirmed" && multisigResult && (
                                        <div className="pt-4 border-t border-green-500/30 space-y-4">
                                            <div className="flex items-center gap-4">
                                                <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                                    Signatures
                                                </span>
                                                <span className={`font-mono text-sm ${multisigResult.thresholdMet ? "text-green-500" : "text-foreground"}`}>
                                                    {multisigResult.signatureCount}
                                                </span>
                                                {multisigResult.thresholdMet && (
                                                    <span className="font-mono text-[10px] text-green-500 bg-green-500/10 px-2 py-1 uppercase tracking-wider">
                                                        Threshold Met!
                                                    </span>
                                                )}
                                            </div>

                                            {multisigResult.thresholdMet && (
                                                <div className="space-y-3">
                                                    <p className="font-mono text-sm text-foreground/80">
                                                        All required signatures have been collected. You can now send the final multi-sig deploy to complete the recovery.
                                                    </p>
                                                    <button
                                                        onClick={handleSendFinalDeploy}
                                                        disabled={isSubmitting}
                                                        className="inline-flex items-center gap-3 border border-green-500/50 bg-green-500/10 px-6 py-3 font-mono text-xs uppercase tracking-widest text-green-500 hover:bg-green-500/20 hover:border-green-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isSubmitting ? "Sending..." : "Send Final Deploy"}
                                                    </button>
                                                </div>
                                            )}

                                            {!multisigResult.thresholdMet && (
                                                <p className="font-mono text-sm text-foreground/80">
                                                    Your approval and signature have been recorded. Waiting for more guardians to approve.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {approvalStatus === "confirmed" && !multisigResult && (
                                        <div className="pt-4 border-t border-green-500/30">
                                            <p className="font-mono text-sm text-foreground/80">
                                                Your approval has been recorded on-chain. Other guardians can now approve.
                                            </p>
                                        </div>
                                    )}

                                    {approvalStatus === "submitted" && (
                                        <div className="pt-4 border-t border-accent/30">
                                            <p className="font-mono text-sm text-foreground/80">
                                                Waiting for contract approval confirmation...
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>
    )
}
