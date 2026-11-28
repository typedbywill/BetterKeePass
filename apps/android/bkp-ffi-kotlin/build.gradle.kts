plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

val repoRoot = rootProject.projectDir.parentFile.parentFile
val jniLibsDir = file("src/main/jniLibs")
val ffiKotlinDir = file("src/main/kotlin")

val buildRustLibs by tasks.registering {
    group = "rust"
    description = "Compila bkp-ffi via cargo-ndk e gera bindings Kotlin com uniffi-bindgen"

    inputs.dir(File(repoRoot, "crates/bkp-ffi/src"))
    inputs.dir(File(repoRoot, "crates/bkp-core/src"))
    inputs.dir(File(repoRoot, "crates/bkp-passkey/src"))
    inputs.file(File(repoRoot, "crates/bkp-ffi/Cargo.toml"))
    outputs.dir(jniLibsDir)
    outputs.dir(ffiKotlinDir)

    doLast {
        if (project.hasProperty("skipRustBuild")) {
            return@doLast
        }
        jniLibsDir.mkdirs()
        ffiKotlinDir.mkdirs()

        val abis = project.findProperty("rustAbis")?.toString()
            ?.split(",")
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: listOf("arm64-v8a", "armeabi-v7a", "x86_64")

        val cargoNdkArgs = mutableListOf("cargo", "ndk")
        abis.forEach { abi ->
            cargoNdkArgs.addAll(listOf("-t", abi))
        }
        cargoNdkArgs.addAll(
            listOf(
                "-o", jniLibsDir.absolutePath,
                "build", "--release", "-p", "bkp-ffi"
            )
        )

        exec {
            workingDir = repoRoot
            commandLine(cargoNdkArgs)
        }

        // Compila para o host para extrair metadados e gerar os bindings Kotlin via uniffi-bindgen.
        exec {
            workingDir = repoRoot
            commandLine("cargo", "build", "--release", "-p", "bkp-ffi")
        }

        val hostLibName = when {
            System.getProperty("os.name").lowercase().contains("mac") -> "libbkp_ffi.dylib"
            System.getProperty("os.name").lowercase().contains("win") -> "bkp_ffi.dll"
            else -> "libbkp_ffi.so"
        }
        val hostLib = File(repoRoot, "target/release/$hostLibName")

        exec {
            workingDir = repoRoot
            commandLine(
                "cargo", "run", "--release", "-p", "bkp-ffi", "--bin", "uniffi-bindgen", "--",
                "generate",
                "--library", hostLib.absolutePath,
                "--language", "kotlin",
                "--out-dir", ffiKotlinDir.absolutePath
            )
        }
    }
}

tasks.named("preBuild") {
    dependsOn(buildRustLibs)
}

android {
    namespace = "app.betterkeepass.ffi"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        minSdk = 28
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    api("net.java.dev.jna:jna:5.15.0@aar")
}
