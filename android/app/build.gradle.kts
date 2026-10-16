plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The connect page has a single source shared with the Electron desktop client
 * (`desktop/connect.html`); it is staged into assets so both clients run the
 * same UI. Platform differences are negotiated through the `capabilities` API
 * (the Android shell reports no `~/.ssh/config` and no identity-file support).
 */
val stagedConnectPageDir = layout.buildDirectory.dir("generated/connectPage")

val stageConnectPage by tasks.registering(Copy::class) {
    description = "Stages the shared desktop connect page into app assets."
    from(rootProject.layout.projectDirectory.file("../desktop/connect.html"))
    into(stagedConnectPageDir)
}

android {
    namespace = "dev.pi.web"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.pi.web"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.getByName("main").assets.srcDir(stagedConnectPageDir)
}

tasks.named("preBuild") {
    dependsOn(stageConnectPage)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
    // Document-start script support, used to shim the Web Notification API.
    implementation("androidx.webkit:webkit:1.12.1")
    // Maintained JSch fork: modern KEX/ciphers plus StrictHostKeyChecking=accept-new.
    implementation("com.github.mwiede:jsch:0.2.26")
}
