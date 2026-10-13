# Ronrón: reglas para la versión optimizada.
# Los trabajos en segundo plano (avisos de pareja, recordatorios) se crean por su nombre.
-keep class com.gonzalo.gamerate.** extends androidx.work.ListenableWorker { <init>(...); }
# Mensajes de error legibles en los informes de fallos.
-keepattributes SourceFile,LineNumberTable
